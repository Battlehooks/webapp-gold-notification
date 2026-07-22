import cors from "cors";
import express from "express";
import { adminRouter } from "./adminApi.js";
import { config } from "./config.js";
import * as scheduler from "./scheduler.js";
import { bot } from "./telegramBot.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/admin", adminRouter);

app.listen(config.port, () => {
  console.log(`notification service listening on :${config.port}`);
});

// Telegram only allows one getUpdates consumer per bot token at a time, so
// SKIP_TELEGRAM_POLLING lets this process run (admin API, scheduler,
// outbound sendMessage) without competing against another deployment of
// the same bot -- e.g. running this locally against a token that's also
// polled by a live server.
if (config.telegramBotToken && process.env.SKIP_TELEGRAM_POLLING !== "1") {
  bot
    .launch()
    .then(() => console.log("telegram bot launched (long polling)"))
    .catch((err) => console.error("failed to launch telegram bot", err));
} else if (!config.telegramBotToken) {
  console.warn("TELEGRAM_BOT_TOKEN not set -- bot not launched, admin API still available");
} else {
  console.warn("SKIP_TELEGRAM_POLLING=1 -- bot not launched, admin API + outbound sendMessage still available");
}

scheduler.start();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
