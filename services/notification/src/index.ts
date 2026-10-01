import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { pushEnabled } from "./push.js";
import { pushRouter } from "./pushApi.js";
import * as scheduler from "./scheduler.js";

// Tables must exist before the first request or scheduled job touches them.
await initDb();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", push: pushEnabled }));
app.use("/push", pushRouter);

app.listen(config.port, () => {
  console.log(`notification service listening on :${config.port}`);
});

if (!pushEnabled) {
  console.warn(
    "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set -- push alerts are off (narration still runs). " +
      "Generate a pair with `npx web-push generate-vapid-keys`."
  );
}

scheduler.start();
