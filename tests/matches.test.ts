import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/database.js";
import {
  adoptProject,
  revokeMatch,
  listMerchantMatches,
} from "../src/services/match.service.js";
import { AppError } from "../src/shared/errors.js";
import { patch, restoreAll } from "./patch.js";
const merchantId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000003";
const matchId = "00000000-0000-4000-8000-000000000004";
// Runs the service transaction against an in-memory fake instead of PostgreSQL.
function withTx(tx: Record<string, unknown>) {
  patch(db, "$transaction", async (fn: (tx: unknown) => unknown) =>
    fn({ $queryRaw: async () => [], ...tx }),
  );
}
const rejectsWith = (promise: Promise<unknown>, status: number, code: string) =>
  assert.rejects(promise, (e) => {
    assert.ok(e instanceof AppError);
    assert.equal(e.status, status);
    assert.equal(e.code, code);
    return true;
  });
afterEach(restoreAll);
test("adoption requires an APPROVED project", async () => {
  withTx({
    project: { findUnique: async () => ({ id: projectId, status: "SUSPENDED" }) },
  });
  await rejectsWith(adoptProject(merchantId, projectId), 409, "PROJECT_UNAVAILABLE");
});
test("adoption is idempotent while a match is ACTIVE", async () => {
  const active = { id: matchId, productionUrlSnapshot: "https://a.example" };
  let created = false;
  withTx({
    project: { findUnique: async () => ({ id: projectId, status: "APPROVED" }) },
    match: {
      findFirst: async () => active,
      create: async () => {
        created = true;
      },
    },
  });
  const result = await adoptProject(merchantId, projectId);
  assert.equal(result.created, false);
  assert.equal(result.match, active);
  assert.equal(created, false);
});
test("readoption waits for the previous deletion to be declared", async () => {
  withTx({
    project: { findUnique: async () => ({ id: projectId, status: "APPROVED" }) },
    match: { findFirst: async () => null },
    revocation: { count: async () => 1 },
  });
  await rejectsWith(adoptProject(merchantId, projectId), 409, "DELETION_PENDING");
});
test("adoption creates a match with the current production URL snapshot", async () => {
  let data: Record<string, unknown> | undefined;
  withTx({
    project: {
      findUnique: async () => ({
        id: projectId,
        status: "APPROVED",
        productionUrl: "https://sistema.example",
      }),
    },
    match: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        data = args.data;
        return { id: matchId, ...args.data };
      },
    },
    revocation: { count: async () => 0 },
  });
  const result = await adoptProject(merchantId, projectId);
  assert.equal(result.created, true);
  assert.equal(result.redirectUrl, "https://sistema.example");
  assert.equal(data!.merchantId, merchantId);
  assert.equal(data!.projectId, projectId);
  assert.equal(data!.productionUrlSnapshot, "https://sistema.example");
  assert.equal(data!.termsVersion, "1.0");
});
const revocableMatch = {
  id: matchId,
  productionUrlSnapshot: "https://sistema.example",
  revocation: null,
  merchant: { businessName: "Loja", whatsapp: "+5511999999999", user: {} },
  project: { title: "Sistema", developer: { email: "dev@example.com" } },
};
test("revocation of another merchant's match is not found", async () => {
  withTx({ match: { findFirst: async () => null } });
  await rejectsWith(revokeMatch(merchantId, matchId), 404, "NOT_FOUND");
});
test("revocation is idempotent and does not emit a second event", async () => {
  const existing = { id: "r1", matchId, status: "AWAITING_DELETION" };
  withTx({
    match: {
      findFirst: async () => ({ ...revocableMatch, revocation: existing }),
      update: async () => assert.fail("must not update"),
    },
  });
  assert.equal(await revokeMatch(merchantId, matchId), existing);
});
test("revocation requires a developer notification e-mail", async () => {
  withTx({
    match: {
      findFirst: async () => ({
        ...revocableMatch,
        project: { title: "Sistema", developer: { email: null } },
      }),
    },
  });
  await rejectsWith(revokeMatch(merchantId, matchId), 409, "DEVELOPER_CONTACT_MISSING");
});
test("revocation marks the match REVOKED and enqueues the legal event in the same transaction", async () => {
  let update: { where: unknown; data: Record<string, unknown> } | undefined;
  let create: { data: Record<string, any> } | undefined;
  withTx({
    match: {
      findFirst: async () => revocableMatch,
      update: async (args: typeof update) => {
        update = args;
      },
    },
    revocation: {
      create: async (args: typeof create) => {
        create = args;
        return args!.data;
      },
    },
  });
  await revokeMatch(merchantId, matchId);
  assert.deepEqual(update!.where, { id: matchId });
  assert.equal(update!.data.status, "REVOKED");
  const data = create!.data;
  assert.equal(data.matchId, matchId);
  assert.equal(data.recipientEmail, "dev@example.com");
  assert.equal(
    data.deletionDeadlineAt.getTime() - data.requestedAt.getTime(),
    48 * 3600000,
  );
  assert.match(data.notificationBody, /Projeto: Sistema/);
  assert.match(data.notificationBody, new RegExp(`Match: ${matchId}`));
  assert.match(data.evidenceReference, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(data.events.create, {
    type: "merchant.revoked.v1",
    payload: { revocationId: data.id },
  });
});
test("merchant dashboard can filter only ACTIVE matches", async () => {
  const wheres: unknown[] = [];
  patch(db.match, "findMany", async (args: { where: unknown }) => {
    wheres.push(args.where);
    return [];
  });
  patch(db.match, "count", async () => 0);
  await listMerchantMatches(merchantId, 1, 20, "ACTIVE");
  await listMerchantMatches(merchantId, 1, 20);
  assert.deepEqual(wheres, [{ merchantId, status: "ACTIVE" }, { merchantId }]);
});
