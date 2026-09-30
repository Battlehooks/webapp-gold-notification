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

  // Agent Service -- owner-only ops agent with real shell access. Runs
  // bare-metal (not in docker-compose), see services/agent/README.md.
  agentUrl: process.env.AGENT_URL || "http://localhost:8003",
  agentToken: process.env.AGENT_TOKEN || "",

  // Shared secret the frontend admin panel must send as `x-admin-token`.
  adminToken: process.env.ADMIN_TOKEN || "",

  suddenMoveCooldownMin: parseInt(process.env.SUDDEN_MOVE_COOLDOWN_MIN || "60", 10),
};
