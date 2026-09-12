import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  isPublicAddress,
  resolvePublic,
  safeGet,
} from "../src/security/safe-http.js";
import {
  accessToken,
  verifyAccessToken,
  hashToken,
} from "../src/security/tokens.js";
import { password, publicUrl } from "../src/validators/common.js";
import { moderationInput, projectInput } from "../src/validators/project.js";
import { env } from "../src/config/env.js";
test("SSRF: reject private, loopback, link-local, CGNAT and mapped IPv6", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
});
test("SSRF: reject private literals and numeric obfuscation without network", async () => {
  for (const url of [
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://localhost",
    "http://169.254.169.254/latest/meta-data",
  ])
    await assert.rejects(resolvePublic(url));
  const result = await safeGet("http://127.0.0.1");
  assert.equal(result.result, "NETWORK_ERROR");
});
test("URLs reject credentials, unsafe schemes, fragments and custom ports", () => {
  for (const value of [
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "http://example.com:5432",
    "https://example.com/#secret",
  ])
    assert.equal(publicUrl.safeParse(value).success, false);
});
test("JWT validates issuer, audience, signature and expiration", () => {
  const token = accessToken("user-id", "session-id");
  assert.equal(verifyAccessToken(token).sessionId, "session-id");
  assert.throws(() => verifyAccessToken(token + "x"));
  const wrongAudience = jwt.sign({ sid: "session-id" }, env.JWT_SECRET, {
    subject: "user-id",
    issuer: "hello-cliente-api",
    audience: "other",
    expiresIn: "1m",
  });
  assert.throws(() => verifyAccessToken(wrongAudience));
  const expired = jwt.sign({ sid: "session-id" }, env.JWT_SECRET, {
    subject: "user-id",
    issuer: "hello-cliente-api",
    audience: "hello-cliente-web",
    expiresIn: -1,
  });
  assert.throws(() => verifyAccessToken(expired));
  assert.equal(hashToken("opaque-token").length, 64);
});
test("bcrypt input is bounded in bytes, including multibyte passwords", () => {
  assert.equal(password.safeParse("á".repeat(37)).success, false);
  assert.equal(password.safeParse("long-valid-passphrase").success, true);
  assert.equal(password.safeParse("short").success, false);
});
test("mass assignment and unjustified rejection are rejected", () => {
  assert.equal(
    projectInput.safeParse({
      title: "Project",
      category: "Vendas",
      description: "A long description for a valid project.",
      productionUrl: "https://example.com",
      demoUrl: "https://example.com/demo",
      status: "APPROVED",
      developerId: "other",
    }).success,
    false,
  );
  assert.equal(
    moderationInput.safeParse({ decision: "REJECTED", justification: "  " })
      .success,
    false,
  );
});
