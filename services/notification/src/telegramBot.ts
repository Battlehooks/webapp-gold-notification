/**
 * Telegram bot, ported from the root project's telegram_poll.py +
 * responder.py access model, but as a real always-on process: telegraf's
 * bot.launch() long-polls Telegram directly instead of a 1-min cron
 * short-poll, so replies land immediately instead of up to ~1 min later.
 * That's the concrete payoff of this service being a persistent process
 * instead of a cron-triggered script.
 *
 * Access model (unchanged from the original):
 *  - Owner (config.ownerChatId) can chat freely and run /pending,
 *    /approve <chat_id>, /deny <chat_id>.
 *  - Anyone else must /start first, which files a pending row and pings the
 *    owner. Only once approved do they get broadcasts and chat replies.
 *  - /stop deactivates; a later /start reactivates without re-approval.
 *  - Owner-only /agent <message> reaches the Agent Service (real,
 *    unsandboxed shell access to the VPS) -- deliberately a separate
 *    command from free-text chat, so an ordinary conversational message can
 *    never accidentally trigger a destructive ops action.
 */
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import * as agent from "./agentClient.js";
import { config } from "./config.js";
import * as db from "./db.js";
import * as insight from "./insightClient.js";

export const bot = new Telegraf(config.telegramBotToken);

function isOwner(chatId: string): boolean {
  return chatId === config.ownerChatId;
}

async function replyViaInsight(chatId: string, text: string): Promise<string> {
  try {
    return await insight.chat(chatId, text);
  } catch (err) {
    console.error("insight chat call failed", err);
    return "Sorry, I couldn't reach the insight service just now -- please try again shortly.";
  }
}

async function replyViaAgent(chatId: string, text: string): Promise<string> {
  try {
    return await agent.chat(`telegram:${chatId}`, text);
  } catch (err) {
    console.error("agent chat call failed", err);
    return "Sorry, I couldn't reach the agent service just now -- please try again shortly.";
  }
}

bot.command("start", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const username = ctx.from?.username ?? null;
  const status = db.requestSubscription(chatId, username);

  if (status === "pending") {
    const uname = username ? `@${username}` : "(no username)";
    try {
      await bot.telegram.sendMessage(
        config.ownerChatId,
        `New subscription request from ${uname} (chat_id ${chatId}).\n` +
          `/approve ${chatId} to accept, /deny ${chatId} to reject.`
      );
    } catch (err) {
      console.error(err);
    }
    await ctx.reply(
      "Thanks! Your request was sent to the owner for approval -- you'll get a message here once it's reviewed."
    );
    return;
  }
  if (status === "already_active") {
    await ctx.reply("You're already subscribed.");
    return;
  }
  await ctx.reply("Welcome back -- you're subscribed again. Send /stop anytime to unsubscribe.");
});

bot.command("stop", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (db.stopSubscriber(chatId)) {
    await ctx.reply("You've been unsubscribed from price updates. Send /start anytime to rejoin.");
  } else {
    await ctx.reply("You're not currently subscribed.");
  }
});

bot.command("pending", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isOwner(chatId)) return;
  const pending = db.pendingSubscribers();
  if (pending.length === 0) {
    await ctx.reply("No pending subscription requests.");
    return;
  }
  const lines = ["Pending requests:"];
  for (const p of pending) {
    const uname = p.username ? `@${p.username}` : "(no username)";
    lines.push(`- ${p.chat_id} ${uname} -- /approve ${p.chat_id} or /deny ${p.chat_id}`);
  }
  await ctx.reply(lines.join("\n"));
});

bot.command("approve", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isOwner(chatId)) return;
  const target = ctx.message.text.split(/\s+/)[1];
  if (!target) {
    await ctx.reply("Usage: /approve <chat_id>");
    return;
  }
  const ok = db.approveSubscriber(target);
  if (ok) {
    try {
      await bot.telegram.sendMessage(
        target,
        "You're approved! You'll now receive scheduled price updates and can ask this bot questions. Send /stop anytime to unsubscribe."
      );
    } catch (err) {
      console.error(err);
    }
  }
  await ctx.reply(ok ? `Approved ${target}.` : `No pending request for ${target}.`);
});

bot.command("deny", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isOwner(chatId)) return;
  const target = ctx.message.text.split(/\s+/)[1];
  if (!target) {
    await ctx.reply("Usage: /deny <chat_id>");
    return;
  }
  const ok = db.denySubscriber(target);
  await ctx.reply(ok ? `Denied ${target}.` : `No pending request for ${target}.`);
});

bot.command("agent", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isOwner(chatId)) return;
  const text = ctx.message.text.replace(/^\/agent(@\w+)?\s*/, "").trim();
  if (!text) {
    await ctx.reply("Usage: /agent <message> -- talks to the ops agent (real shell access to the VPS).");
    return;
  }
  const reply = await replyViaAgent(chatId, text);
  await ctx.reply(reply.slice(0, 4000)); // Telegram's message length cap is ~4096 chars
});

bot.on(message("text"), async (ctx) => {
  const chatId = String(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (isOwner(chatId)) {
    await ctx.reply(await replyViaInsight(chatId, text));
    return;
  }

  const sub = db.getSubscriber(chatId);
  if (sub?.status === "active") {
    await ctx.reply(await replyViaInsight(chatId, text));
    return;
  }
  if (sub?.status === "pending") {
    await ctx.reply("Your subscription request is still pending the owner's approval.");
    return;
  }
  await ctx.reply("You're not subscribed yet. Send /start to request access.");
});

export function recipients(): string[] {
  return [config.ownerChatId, ...db.activeSubscriberIds()];
}

export async function broadcastMessage(text: string, chatIds: string[]): Promise<void> {
  for (const chatId of chatIds) {
    if (!chatId) continue;
    try {
      await bot.telegram.sendMessage(chatId, text);
    } catch (err) {
      console.error(`broadcast to ${chatId} failed`, err);
    }
  }
}
