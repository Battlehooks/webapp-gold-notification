import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

const origin = "http://localhost:5173";
process.env.DATABASE_URL = "";
process.env.NOTIFICATION_DB_PATH = ":memory:";
process.env.ACCOUNT_ORIGIN = origin;

const { accountRouter } = await import("../dist/accountApi.js");

test("account sessions isolate portfolios and reject stale editors", async (t) => {
  const app = express();
  app.use("/account", accountRouter);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/account`;

  async function request(path = "", { method = "GET", body, cookie, from = origin } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: from,
        ...(cookie && { Cookie: cookie }),
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
    return { response, data: await response.json() };
  }

  const alice = { email: "Alice@example.test", password: "alice-test-password" };
  const bob = { email: "bob@example.test", password: "bob-test-password" };
  const register = (body) => request("/register", { method: "POST", body });
  const a = await register(alice);
  const b = await register(bob);
  assert.equal(a.response.status, 201);
  assert.equal(b.response.status, 201);
  const sessionCookie = a.response.headers.get("set-cookie");
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
  assert.equal(a.response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(a.response.headers.get("cache-control"), "no-store");
  const cookieA = sessionCookie.split(";")[0];
  const cookieB = b.response.headers.get("set-cookie").split(";")[0];

  const duplicate = await register({ ...alice, email: alice.email.toLowerCase() });
  assert.equal(duplicate.response.status, 409);
  assert.deepEqual((await request()).data, { account: null });

  const draft = { accountId: a.data.account.id, revision: 0, lots: [
    { source: "btc", qty: 0.02, avg: 1_500_000_000 },
    { source: "btc", qty: 0.01, avg: 1_600_000_000 },
  ] };
  const save = (cookie, body = draft, from = origin) =>
    request("/holdings", { method: "PUT", body, cookie, from });

  assert.equal((await save(undefined)).response.status, 401);
  assert.equal((await save(cookieA, draft, "https://unrelated.example")).response.status, 403);
  assert.equal((await save(cookieB)).response.status, 409);
  assert.equal((await save(cookieA, { ...draft, lots: [{ source: "btc", qty: -1, avg: 1 }] })).response.status, 400);
  const updates = await Promise.all([save(cookieA), save(cookieA)]);
  assert.deepEqual(updates.map(({ response }) => response.status).sort(), [200, 409]);
  assert.deepEqual((await request("", { cookie: cookieB })).data.account.lots, []);

  const wrong = await request("/login", { method: "POST", body: { ...alice, password: "wrong" } });
  assert.equal(wrong.response.status, 401);
  const signedIn = await request("/login", { method: "POST", body: alice });
  assert.equal(signedIn.response.status, 200);
  assert.deepEqual(signedIn.data.account.lots, draft.lots);
  assert.equal(signedIn.data.account.revision, 1);

  const logout = await request("/logout", { method: "POST", body: { accountId: a.data.account.id }, cookie: cookieA });
  assert.equal(logout.response.status, 200);
  assert.equal((await save(cookieA)).response.status, 401);
  assert.deepEqual((await request("", { cookie: cookieA })).data, { account: null });
});
