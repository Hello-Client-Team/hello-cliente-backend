import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { db } from "../src/config/database.js";
import { redis } from "../src/config/redis.js";
import { registration } from "../src/validators/auth.js";
import { registerMerchant, loginMerchant } from "../src/services/auth.service.js";
import { authController } from "../src/controllers/auth.controller.js";

// Prisma delegates expose methods through a Proxy rather than own descriptors.
function stub(t: TestContext, delegate: any, key: string, implementation: (...args: any[]) => any) {
  const original = delegate[key];
  const replacement = t.mock.fn(implementation);
  delegate[key] = replacement;
  t.after(() => { delegate[key] = original; });
  return replacement;
}

test("registration without OTP stores an unverified phone and allows password login", async (t) => {
  const input = registration.parse({
    name: "Test Merchant", whatsapp: "+5511999999999",
    password: "test-password-123", businessName: "Test Store",
    businessSector: "Retail", termsVersion: "1.0",
  });
  const user = { id: "test-user", name: input.name, role: "MERCHANT",
    email: null, emailVerifiedAt: null, createdAt: new Date() };
  let stored: any;
  stub(t, db.user, "create", async ({ data }: any) => {
    stored = data.merchant.create;
    assert.equal(data.role, "MERCHANT");
    return user;
  });
  stub(t, db.session, "create", async () => ({ id: "test-session" }));
  stub(t, db.merchant, "findUnique", async () => ({ ...stored, userId: user.id, user }));
  t.mock.method(redis, "eval", async () => 1);
  t.mock.method(redis, "get", async () => { throw new Error("OTP must not be consulted"); });

  const registered = await registerMerchant(input);
  assert.equal(registered.user.id, user.id);
  assert.equal(stored.whatsappVerifiedAt, null);
  assert.notEqual(stored.passwordHash, input.password);
  assert.ok(await bcrypt.compare(input.password, stored.passwordHash));
  const loggedIn = await loginMerchant(input);
  assert.ok(loggedIn.accessToken);
  await assert.rejects(loginMerchant({ ...input, password: "wrong-password" }),
    { code: "INVALID_CREDENTIALS" });
  assert.equal(registration.safeParse({ ...input, role: "ADMIN" }).success, false);
});

test("disabled verification and password recovery cannot change credentials", (t) => {
  const write = stub(t, db.merchant, "update", async () => { throw new Error("Unexpected write"); });
  for (const [handler, code] of [
    [authController.verification, "VERIFICATION_DISABLED"],
    [authController.reset, "PASSWORD_RESET_DISABLED"],
  ] as const) {
    assert.throws(() => handler({ body: { whatsapp: "+5511999999999", password: "new-password-123" } } as Request,
      {} as Response), { status: 503, code });
  }
  assert.equal(write.mock.callCount(), 0);
});
