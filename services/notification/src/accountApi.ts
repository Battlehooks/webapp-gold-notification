import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";
import { config } from "./config.js";
import * as db from "./db.js";

const COOKIE = "gold_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOTS = 200;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const secure = config.accountOrigin.startsWith("https:");
const cookieOptions = { httpOnly: true, sameSite: "lax", secure, path: "/" } as const;
const attempts = new Map<string, number>();
let windowStart = Date.now();
let hashesInFlight = 0;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function sessionHash(req: Request): string | undefined {
  const match = req.headers.cookie?.match(/(?:^|;\s*)gold_session=([A-Za-z0-9_-]{43})(?:;|$)/);
  return match && hashToken(match[1]) || undefined;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function credentials(body: unknown, registering: boolean) {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return null;
  if (password.length < (registering ? 12 : 1) || Buffer.byteLength(password) > 512) return null;
  return { email: normalized, password };
}

function parseLots(value: unknown): db.PushHolding[] | null {
  if (!Array.isArray(value) || value.length > MAX_LOTS) return null;
  const lots: db.PushHolding[] = [];
  for (const item of value) {
    const { source, qty, avg } = (item ?? {}) as Record<string, unknown>;
    if (typeof source !== "string" || !/^[a-z0-9_]{1,32}$/.test(source) ||
        typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 ||
        typeof avg !== "number" || !Number.isFinite(avg) || avg < 0) return null;
    lots.push({ source, qty, avg });
  }
  return lots;
}

const route = (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => { void handler(req, res).catch(next); };

export const accountRouter = express.Router();
accountRouter.use(cors({ origin: config.accountOrigin, credentials: true }));
accountRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET" && req.get("Origin") !== config.accountOrigin) {
    res.status(403).json({ error: "This request must come from the configured frontend." });
    return;
  }
  next();
});
accountRouter.use(express.json({ limit: "32kb" }));

function authenticate(registering: boolean) {
  return route(async (req, res) => {
    const input = credentials(req.body, registering);
    if (!input) {
      res.status(400).json({ error: registering ? "Enter a valid email and a password of at least 12 characters." : "Enter your email and password." });
      return;
    }

    if (Date.now() - windowStart >= AUTH_WINDOW_MS) {
      attempts.clear();
      windowStart = Date.now();
    }
    const client = req.ip || "unknown";
    const count = attempts.get(client) ?? 0;
    if (hashesInFlight >= 4 || count >= 40 || (!attempts.has(client) && attempts.size >= 4096)) {
      res.set("Retry-After", String(hashesInFlight >= 4 ? 2 : Math.ceil((windowStart + AUTH_WINDOW_MS - Date.now()) / 1000)));
      res.status(429).json({ error: "Too many sign-in attempts. Try again shortly." });
      return;
    }
    attempts.set(client, count + 1);

    hashesInFlight++;
    try {
      let account = await db.accountByEmail(input.email);
      if (registering) {
        const salt = randomBytes(16);
        const key = await derive(input.password, salt);
        const id = randomUUID();
        if (!(await db.createAccount(id, input.email, salt.toString("hex") + ":" + key.toString("hex")))) {
          res.status(409).json({ error: "This email already has an account. Sign in to continue." });
          return;
        }
        account = { id, email: input.email, holdings: "[]", revision: 0, password_hash: "" };
      } else {
        const [salt, stored] = account?.password_hash.split(":") ?? [];
        const key = await derive(input.password, salt ? Buffer.from(salt, "hex") : Buffer.alloc(16));
        if (!account || !stored || !timingSafeEqual(key, Buffer.from(stored, "hex"))) {
          res.status(401).json({ error: "Email or password is incorrect." });
          return;
        }
      }

      const previous = sessionHash(req);
      const token = randomBytes(32).toString("base64url");
      await db.createSession(hashToken(token), account.id, new Date(Date.now() + SESSION_MS));
      if (previous) await db.deleteSession(previous);
      res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
      res.status(registering ? 201 : 200).json({
        account: { id: account.id, email: account.email, lots: JSON.parse(account.holdings), revision: account.revision },
      });
    } finally {
      hashesInFlight--;
    }
  });
}

accountRouter.post("/register", authenticate(true));
accountRouter.post("/login", authenticate(false));

accountRouter.get("/", route(async (req, res) => {
  const hash = sessionHash(req);
  const account = hash ? await db.accountForSession(hash) : undefined;
  res.json({
    account: account ? { id: account.id, email: account.email, lots: JSON.parse(account.holdings), revision: account.revision } : null,
  });
}));

accountRouter.post("/logout", route(async (req, res) => {
  const hash = sessionHash(req);
  const account = hash ? await db.accountForSession(hash) : undefined;
  if (account && account.id !== req.body?.accountId) {
    res.status(409).json({ error: "The signed-in account changed. Reopen the account menu." });
    return;
  }
  if (hash) await db.deleteSession(hash);
  res.clearCookie(COOKIE, cookieOptions);
  res.json({ ok: true });
}));

accountRouter.put("/holdings", route(async (req, res) => {
  const hash = sessionHash(req);
  const account = hash ? await db.accountForSession(hash) : undefined;
  if (!hash || !account) {
    res.status(401).json({ error: "Your session expired. Sign in to save your holdings." });
    return;
  }
  const { accountId, revision, lots } = req.body ?? {};
  const parsed = parseLots(lots);
  if (!parsed || !Number.isSafeInteger(revision) || revision < 0) {
    res.status(400).json({ error: "Enter valid holdings and limit the portfolio to 200 purchases." });
    return;
  }
  if (accountId !== account.id || !(await db.savePortfolio(account.id, revision, parsed, hash))) {
    res.status(409).json({ error: "The portfolio changed. Close and reopen the editor to load the latest holdings." });
    return;
  }
  res.json({ lots: parsed, revision: revision + 1 });
}));

const accountError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err.status === 400 || err.status === 413) {
    res.status(err.status).json({ error: "The request body is invalid or too large." });
    return;
  }
  console.error("Account request failed", err);
  res.status(500).json({ error: "The account service could not complete this request." });
};
accountRouter.use(accountError);
