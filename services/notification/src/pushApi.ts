/** REST API the frontend uses to turn alerts on/off for its browser.
 *
 * A device is identified by a random UUID the browser generates and keeps in
 * localStorage; knowing it is what lets a browser update or delete its own
 * row, so it's treated as a secret and never listed back out. */
import express, { type NextFunction, type Request, type Response, Router } from "express";
import { config } from "./config.js";
import * as db from "./db.js";
import { pushEnabled, send } from "./push.js";

export const pushRouter: Router = express.Router();

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Only real browser push services -- this server POSTs to whatever endpoint a
// subscription names, so an arbitrary URL here would let anyone point it at
// internal hosts.
const PUSH_HOSTS = [".googleapis.com", ".mozilla.com", ".mozaws.net", ".notify.windows.com", ".push.apple.com"];
const MAX_HOLDINGS = 20;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseDevice(body: unknown): Parsed<{ subscription: db.PushSubscriptionJson; holdings: db.PushHolding[]; rules: db.AlertRules }> {
  const b = body as Record<string, unknown> | null;
  const sub = b?.subscription as Partial<db.PushSubscriptionJson> | undefined;
  let host = "";
  try {
    const url = new URL(String(sub?.endpoint));
    if (url.protocol === "https:") host = url.hostname;
  } catch {
    /* not a URL */
  }
  if (!host || !PUSH_HOSTS.some((h) => host.endsWith(h))) {
    return { ok: false, error: "subscription.endpoint must be an https URL of a browser push service" };
  }
  if (typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string") {
    return { ok: false, error: "subscription.keys.p256dh and .auth are required" };
  }

  const rawHoldings = Array.isArray(b?.holdings) ? (b.holdings as Record<string, unknown>[]) : null;
  if (!rawHoldings || rawHoldings.length > MAX_HOLDINGS) {
    return { ok: false, error: `holdings must be an array of at most ${MAX_HOLDINGS}` };
  }
  const holdings: db.PushHolding[] = [];
  for (const h of rawHoldings) {
    const source = h?.source, qty = h?.qty, avg = h?.avg;
    if (typeof source !== "string" || !/^[a-z0-9_]{1,32}$/.test(source)) return { ok: false, error: "holding.source is invalid" };
    if (typeof qty !== "number" || !(qty > 0) || typeof avg !== "number" || !(avg >= 0)) {
      return { ok: false, error: `holding ${source}: qty must be > 0 and avg >= 0` };
    }
    holdings.push({ source, qty, avg });
  }

  const r = (b?.rules ?? {}) as Record<string, unknown>;
  const pct = (v: unknown, max: number): number | null | undefined =>
    v == null ? null : typeof v === "number" && v > 0 && v <= max ? v : undefined;
  const takeProfitPct = pct(r.takeProfitPct, 1000);
  const stopLossPct = pct(r.stopLossPct, 99);
  if (takeProfitPct === undefined) return { ok: false, error: "rules.takeProfitPct must be between 0 and 1000, or null" };
  if (stopLossPct === undefined) return { ok: false, error: "rules.stopLossPct must be between 0 and 99, or null" };
  const rules: db.AlertRules = {
    takeProfitPct,
    stopLossPct,
    signalChanges: r.signalChanges === true,
    suddenMoves: r.suddenMoves === true,
  };

  return {
    ok: true,
    value: { subscription: { endpoint: String(sub.endpoint), keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, holdings, rules },
  };
}

function deviceId(req: Request, res: Response): string | null {
  const id = String(req.params.deviceId ?? "").toLowerCase();
  if (!DEVICE_ID_RE.test(id)) {
    res.status(400).json({ error: "device id must be a UUID" });
    return null;
  }
  return id;
}

function requirePush(_req: Request, res: Response, next: NextFunction): void {
  if (!pushEnabled) {
    res.status(503).json({ error: "push alerts are not configured on the server (VAPID keys missing)" });
    return;
  }
  next();
}

pushRouter.use(requirePush);

pushRouter.get("/public-key", (_req, res) => {
  res.json({ publicKey: config.vapidPublicKey });
});

pushRouter.put("/devices/:deviceId", async (req, res, next) => {
  const id = deviceId(req, res);
  if (!id) return;
  const parsed = parseDevice(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await db.upsertDevice(id, parsed.value.subscription, parsed.value.holdings, parsed.value.rules);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

pushRouter.delete("/devices/:deviceId", async (req, res, next) => {
  const id = deviceId(req, res);
  if (!id) return;
  try {
    res.json({ ok: await db.deleteDevice(id) });
  } catch (err) {
    next(err);
  }
});

pushRouter.post("/devices/:deviceId/test", async (req, res, next) => {
  const id = deviceId(req, res);
  if (!id) return;
  try {
    const device = await db.getDevice(id);
    if (!device) {
      res.status(404).json({ error: "alerts aren't on for this browser" });
      return;
    }
    const ok = await send(device, {
      title: "Alerts are on",
      body: "This is how price alerts will look. You can close the web app -- they still arrive.",
      tag: "test",
      ttlSec: 300,
    });
    res.status(ok ? 200 : 502).json({ ok });
  } catch (err) {
    next(err);
  }
});
