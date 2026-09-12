import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/database.js";
import { redis } from "../src/config/redis.js";
import { env } from "../src/config/env.js";
import { startOAuth, finishOAuth } from "../src/services/oauth.service.js";
import { authController } from "../src/controllers/auth.controller.js";
import type { Request, Response } from "express";

test("OAuth linking binds the authenticated session, rejects conflicts and consumes state once", async (t) => {
  const oldId = env.LINKEDIN_CLIENT_ID, oldSecret = env.LINKEDIN_CLIENT_SECRET;
  env.LINKEDIN_CLIENT_ID = "test-client";
  env.LINKEDIN_CLIENT_SECRET = "test-secret";
  t.after(() => { env.LINKEDIN_CLIENT_ID = oldId; env.LINKEDIN_CLIENT_SECRET = oldSecret; });
  const states = new Map<string, string>();
  t.mock.method(redis, "set", async (key: string, value: string) => { states.set(key, value); return "OK"; });
  t.mock.method(redis, "getdel", async (key: string) => { const value = states.get(key); states.delete(key); return value; });
  let verified = true;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
    new globalThis.Response(JSON.stringify(String(url).includes("accessToken")
      ? { access_token: "provider-token" }
      : { sub: "linkedin-account", name: "Developer", email: "dev@example.com", email_verified: verified }),
      { status: 200 }));
  let revoked = false, expired = false, role = "DEVELOPER";
  let owner: string | null = null, emailOwner = "user-a", writes = 0;
  const tx = {
    session: { findUnique: async () => ({ userId: "user-a", revokedAt: revoked ? new Date() : null,
      expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)), user: { role } }) },
    user: { findUnique: async () => ({ id: emailOwner }) },
    oAuthAccount: {
      findUnique: async () => owner ? { userId: owner } : null,
      create: async ({ data }: any) => { assert.equal(data.userId, "user-a"); writes++; owner = data.userId; },
    },
  };
  const originalTransaction = db.$transaction;
  db.$transaction = (async (fn: any) => fn(tx)) as typeof db.$transaction;
  t.after(() => { db.$transaction = originalTransaction; });
  const begin = () => startOAuth("linkedin", { userId: "user-a", sessionId: "session-a" });
  const complete = async () => finishOAuth("linkedin", "code", (await begin()).state);
  const first = await begin();
  assert.deepEqual(JSON.parse([...states.values()][0]).link, { userId: "user-a", sessionId: "session-a" });
  assert.deepEqual(await finishOAuth("linkedin", "code", first.state), { linked: true });
  assert.equal(writes, 1);
  await assert.rejects(finishOAuth("linkedin", "code", first.state), { code: "INVALID_OAUTH_STATE" });
  await complete(); // Same provider account linked to the same user is idempotent.
  assert.equal(writes, 1);
  owner = "other-user";
  await assert.rejects(complete(), { code: "OAUTH_ACCOUNT_IN_USE" });
  owner = null; emailOwner = "other-user";
  await assert.rejects(complete(), { code: "ACCOUNT_LINK_REQUIRED" });
  emailOwner = "user-a"; revoked = true;
  await assert.rejects(complete(), { code: "UNAUTHORIZED" });
  revoked = false; expired = true;
  await assert.rejects(complete(), { code: "UNAUTHORIZED" });
  expired = false; role = "ADMIN";
  await assert.rejects(complete(), { code: "FORBIDDEN" });
  role = "DEVELOPER"; verified = false;
  await assert.rejects(complete(), { code: "VERIFIED_EMAIL_REQUIRED" });
  verified = true;
  await assert.rejects(finishOAuth("github", "code", (await begin()).state), { code: "INVALID_OAUTH_STATE" });
  assert.equal(writes, 1);
});

test("OAuth callback rejects a missing browser state cookie before exchanging codes", async () => {
  await assert.rejects(authController.oauthCallback({
    params: { provider: "linkedin" }, query: { code: "code", state: "x".repeat(48) }, cookies: {},
  } as unknown as Request, {} as Response), { code: "INVALID_OAUTH_STATE" });
});
