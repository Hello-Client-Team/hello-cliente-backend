import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { db } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { deliverRevocation } from "../src/workers/notification.worker.js";
import { checkProject } from "../src/workers/health.worker.js";
import { patch, restoreAll } from "./patch.js";
const revocationId = "00000000-0000-4000-8000-000000000007";
const projectId = "00000000-0000-4000-8000-000000000003";
afterEach(restoreAll);
// The mailer caches its transport, so every test routes through this one fake.
let sendMail: (mail: Record<string, unknown>) => Promise<unknown>;
(nodemailer as unknown as Record<string, unknown>).createTransport = () => ({
  sendMail: (mail: Record<string, unknown>) => sendMail(mail),
  close: () => {},
});
function fakeRevocationDb(revocation: Record<string, unknown>) {
  const calls = {
    attempts: [] as Record<string, unknown>[],
    attemptUpdates: [] as Record<string, unknown>[],
    revocationUpdates: [] as Record<string, unknown>[],
  };
  const notificationAttempt = {
    create: async (args: { data: Record<string, unknown> }) => {
      calls.attempts.push(args.data);
      return { id: "attempt-1", ...args.data };
    },
    update: async (args: { data: Record<string, unknown> }) => {
      calls.attemptUpdates.push(args.data);
    },
  };
  const revocations = {
    findUniqueOrThrow: async () => revocation,
    update: async (args: { data: Record<string, unknown> }) => {
      calls.revocationUpdates.push(args.data);
    },
  };
  patch(db.revocation, "findUniqueOrThrow", revocations.findUniqueOrThrow);
  patch(db.notificationAttempt, "create", notificationAttempt.create);
  patch(db.notificationAttempt, "update", notificationAttempt.update);
  patch(db, "$transaction", async (fn: (tx: unknown) => unknown) =>
    fn({ revocation: revocations, notificationAttempt }),
  );
  patch(env, "SMTP_HOST", "smtp.example.com");
  patch(env, "MAIL_FROM", "Hello Cliente <no-reply@example.com>");
  return calls;
}
const pendingRevocation = {
  id: revocationId,
  recipientEmail: "dev@example.com",
  notificationBody: "Hello Cliente — solicitação de exclusão de dados",
  notificationAcceptedAt: null,
  deletionDeclaredAt: null,
  deletionDeadlineAt: new Date(Date.now() + 48 * 3600000),
};
test("LGPD worker e-mails the developer the stored legal text and records acceptance", async () => {
  const calls = fakeRevocationDb(pendingRevocation);
  const sent: Record<string, unknown>[] = [];
  sendMail = async (mail) => {
    sent.push(mail);
    return { accepted: [mail.to], messageId: "<provider-id>" };
  };
  await deliverRevocation(revocationId);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, "dev@example.com");
  assert.equal(sent[0]!.text, pendingRevocation.notificationBody);
  assert.equal(sent[0]!.messageId, `<revocation-${revocationId}@localhost>`);
  assert.ok(calls.attemptUpdates[0]!.acceptedAt instanceof Date);
  assert.equal(calls.revocationUpdates[0]!.status, "AWAITING_DELETION");
  assert.equal(calls.revocationUpdates[0]!.providerMessageId, "<provider-id>");
});
test("LGPD worker does not resend an e-mail already accepted by the provider", async () => {
  const calls = fakeRevocationDb({
    ...pendingRevocation,
    notificationAcceptedAt: new Date(),
  });
  sendMail = async () => assert.fail("must not send");
  await deliverRevocation(revocationId);
  assert.equal(calls.attempts.length, 0);
});
test("LGPD worker records a failed attempt and rethrows so the queue retries", async () => {
  const calls = fakeRevocationDb(pendingRevocation);
  sendMail = async () => {
    throw new Error("SMTP down");
  };
  await assert.rejects(deliverRevocation(revocationId), /SMTP down/);
  assert.equal(calls.attemptUpdates[0]!.failureCode, "SEND_OR_RECORD_FAILED");
  assert.equal(calls.revocationUpdates.length, 0);
});
function fakeProjectDb(project: Record<string, unknown>) {
  let state = { ...project };
  const updates: Record<string, unknown>[] = [];
  const healthChecks: Record<string, unknown>[] = [];
  const tx = {
    project: {
      findUnique: async () => ({ ...state }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        state = { ...state, ...args.data };
        return { ...state };
      },
    },
    healthCheck: {
      create: async (args: { data: Record<string, unknown> }) => {
        healthChecks.push(args.data);
      },
    },
  };
  patch(db, "$transaction", async (fn: (tx: unknown) => unknown) => fn(tx));
  return { updates, healthChecks };
}
// .localhost is refused by the SSRF guard before any network I/O: a deterministic broken link.
const brokenUrl = "https://sistema-quebrado.localhost";
test("healthcheck suspends an APPROVED project when its link fails for the threshold-th time", async () => {
  const { updates, healthChecks } = fakeProjectDb({
    id: projectId,
    productionUrl: brokenUrl,
    status: "APPROVED",
    consecutiveFailures: env.HEALTH_FAILURE_THRESHOLD - 1,
    nextHealthCheckAt: null,
    healthLeaseUntil: null,
    healthLeaseToken: null,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  });
  await checkProject({ projectId, url: brokenUrl }, "job-1");
  assert.equal(healthChecks.length, 1);
  assert.equal(healthChecks[0]!.result, "NETWORK_ERROR");
  assert.equal(healthChecks[0]!.checkedUrl, brokenUrl);
  const final = updates.at(-1)!;
  assert.equal(final.status, "SUSPENDED");
  assert.equal(final.consecutiveFailures, env.HEALTH_FAILURE_THRESHOLD);
  assert.ok(final.suspendedAt instanceof Date);
  assert.match(String(final.suspensionReason), /^HEALTHCHECK:/);
  assert.equal(final.healthLeaseToken, null);
  assert.ok((final.nextHealthCheckAt as Date).getTime() > Date.now());
});
test("healthcheck skips a project whose lease is held by another worker", async () => {
  const { updates, healthChecks } = fakeProjectDb({
    id: projectId,
    productionUrl: brokenUrl,
    status: "APPROVED",
    consecutiveFailures: 0,
    nextHealthCheckAt: null,
    healthLeaseUntil: new Date(Date.now() + 60000),
    healthLeaseToken: "other-job",
    updatedAt: new Date(),
  });
  await checkProject({ projectId, url: brokenUrl }, "job-2");
  assert.equal(updates.length, 0);
  assert.equal(healthChecks.length, 0);
});
