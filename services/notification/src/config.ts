import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  dbPath: process.env.NOTIFICATION_DB_PATH || "./notification.db",

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  ownerChatId: process.env.TELEGRAM_CHAT_ID || "",

  marketDataUrl: process.env.MARKET_DATA_URL || "http://localhost:8001",
  insightUrl: process.env.INSIGHT_URL || "http://localhost:8002",

  // Shared secret the frontend admin panel must send as `x-admin-token`.
  adminToken: process.env.ADMIN_TOKEN || "",

  suddenMoveCooldownMin: parseInt(process.env.SUDDEN_MOVE_COOLDOWN_MIN || "60", 10),
};
