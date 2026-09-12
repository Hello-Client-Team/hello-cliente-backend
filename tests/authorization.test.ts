import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { requireRole, authenticate } from "../src/middlewares/auth.js";
import { trustedOrigin } from "../src/middlewares/security.js";
import { sessionModel } from "../src/models/session.model.js";
import { accessToken } from "../src/security/tokens.js";
import { nextHealthState } from "../src/workers/health.worker.js";
import { deletionDeadline } from "../src/services/match.service.js";
const response = {} as Response;
test("RBAC rejects anonymous users and the wrong role", () => {
  const guard = requireRole("ADMIN");
  assert.throws(() => guard({} as Request, response, () => {}));
  assert.throws(() =>
    guard({ actor: { role: "MERCHANT" } } as Request, response, () => {}),
  );
  let called = false;
  guard({ actor: { role: "ADMIN" } } as Request, response, () => {
    called = true;
  });
  assert.equal(called, true);
});
test("CSRF rejects missing and untrusted Origin", () => {
  for (const origin of [undefined, "https://attacker.example"]) {
    assert.throws(() =>
      trustedOrigin(
        { get: () => origin } as unknown as Request,
        response,
        () => {},
      ),
    );
  }
  let called = false;
  trustedOrigin(
    { get: () => "http://localhost:3000" } as unknown as Request,
    response,
    () => {
      called = true;
    },
  );
  assert.equal(called, true);
});
test("a revoked database session invalidates even a correctly signed JWT", async () => {
  const method = mock.method(
    sessionModel,
    "findForAuthentication",
    async () => ({
      id: "session",
      tokenHash: "hash",
      createdAt: new Date(),
      userId: "user",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      user: { id: "user", role: "MERCHANT" as const },
    }),
  );
  try {
    await assert.rejects(async () =>
      authenticate(
        {
          get: () => `Bearer ${accessToken("user", "session")}`,
        } as unknown as Request,
        response,
        (() => {}) as NextFunction,
      ),
    );
  } finally {
    method.mock.restore();
  }
});
test("healthcheck suspends only at threshold; success resets counter without automatic reactivation", () => {
  assert.deepEqual(nextHealthState("APPROVED", 1, false, 3), {
    status: "APPROVED",
    failures: 2,
  });
  assert.deepEqual(nextHealthState("APPROVED", 2, false, 3), {
    status: "SUSPENDED",
    failures: 3,
  });
  assert.deepEqual(nextHealthState("APPROVED", 2, true, 3), {
    status: "APPROVED",
    failures: 0,
  });
  assert.deepEqual(nextHealthState("SUSPENDED", 3, true, 3), {
    status: "SUSPENDED",
    failures: 0,
  });
});
test("revocation deadline is exactly 48 elapsed hours", () => {
  const now = new Date("2026-09-09T15:00:00Z");
  assert.equal(deletionDeadline(now).toISOString(), "2026-09-11T15:00:00.000Z");
});
