import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
// Resolve the shared .env from src/ or dist/. The working-directory .env
// and existing environment variables take precedence.
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const config = {
  accountTrustProxy: process.env.ACCOUNT_TRUST_PROXY === "true",
  accountOrigin: new URL(process.env.ACCOUNT_ORIGIN || "http://localhost:5173").origin,
  port: parseInt(process.env.PORT || "3000", 10),
  dbPath: process.env.NOTIFICATION_DB_PATH || "./notification.db",
  // Postgres instead of dbPath when set; this service's tables live in their
  // own schema of that shared database (see db.ts).
  databaseUrl: process.env.DATABASE_URL || "",
  dbSchema: process.env.DB_SCHEMA || "notification",

  marketDataUrl: process.env.MARKET_DATA_URL || "http://localhost:8001",
  insightUrl: process.env.INSIGHT_URL || "http://localhost:8002",

  // Web push (VAPID) key pair -- generate once with
  // `npx web-push generate-vapid-keys`. Blank = push alerts off; the
  // narration scheduler still runs.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  // Contact the browser push services can reach the sender at (mailto: or https:).
  vapidSubject: process.env.VAPID_SUBJECT || "https://github.com/Battlehooks/webapp-gold-notification",

  suddenMoveCooldownMin: parseInt(process.env.SUDDEN_MOVE_COOLDOWN_MIN || "60", 10),
};
