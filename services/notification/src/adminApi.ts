/** Token-protected admin REST API, consumed by the frontend's admin panel --
 * replaces the original /pending, /approve, /deny Telegram owner commands
 * with a web UI, while those commands keep working too. */
import express, { type NextFunction, type Request, type Response, Router } from "express";
import { config } from "./config.js";
import * as db from "./db.js";
import { bot } from "./telegramBot.js";

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.header("x-admin-token");
  if (!config.adminToken || token !== config.adminToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export const adminRouter: Router = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get("/subscribers", (_req, res) => {
  res.json({ subscribers: db.allSubscribers() });
});

adminRouter.get("/subscribers/pending", (_req, res) => {
  res.json({ pending: db.pendingSubscribers() });
});

adminRouter.post("/subscribers/:chatId/approve", async (req, res) => {
  const chatId = req.params.chatId;
  const ok = db.approveSubscriber(chatId);
  if (ok) {
    try {
      await bot.telegram.sendMessage(
        chatId,
        "You're approved! You'll now receive scheduled price updates and can ask this bot questions. Send /stop anytime to unsubscribe."
      );
    } catch (err) {
      console.error(err);
    }
  }
  res.json({ ok });
});

adminRouter.post("/subscribers/:chatId/deny", (req, res) => {
  res.json({ ok: db.denySubscriber(req.params.chatId) });
});
