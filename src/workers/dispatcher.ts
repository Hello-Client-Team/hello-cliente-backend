import { db } from "../config/database.js";
import { notificationQueue, healthQueue } from "./queues.js";
import { logger } from "../config/logger.js";
export async function dispatchOutbox() {
  const now = new Date();
  const events = await db.outboxEvent.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lockedUntil: { lte: now } },
      ],
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  for (const event of events) {
    const claim = await db.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: event.status,
        lockedUntil: event.lockedUntil,
      },
      data: {
        status: "PROCESSING",
        lockedUntil: new Date(Date.now() + 60000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      await notificationQueue.add(
        "revocation",
        { revocationId: event.revocationId },
        { jobId: event.id },
      );
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + 3600000),
          lastError: null,
        },
      });
    } catch {
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          lockedUntil: null,
          lastError: "BROKER_PUBLISH_FAILED",
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(event.attempts, 7)),
          ),
        },
      });
      logger.warn({ eventId: event.id }, "outbox_publish_failed");
    }
  }
}
export async function reconcileNotifications() {
  const due = await db.outboxEvent.findMany({
    where: {
      status: "PUBLISHED",
      nextAttemptAt: { lte: new Date() },
      revocation: { notificationAcceptedAt: null },
    },
    take: 50,
  });
  for (const event of due) {
    const job = await notificationQueue.getJob(event.id);
    if (!job)
      await notificationQueue.add(
        "revocation",
        { revocationId: event.revocationId },
        { jobId: event.id },
      );
    else if ((await job.getState()) === "failed") await job.retry();
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date(Date.now() + 3600000) },
    });
  }
}
export async function scheduleHealthchecks() {
  const now = new Date();
  const due = await db.project.findMany({
    where: {
      status: { in: ["APPROVED", "SUSPENDED"] },
      AND: [
        {
          OR: [
            { nextHealthCheckAt: null },
            { nextHealthCheckAt: { lte: now } },
          ],
        },
        {
          OR: [{ healthLeaseUntil: null }, { healthLeaseUntil: { lte: now } }],
        },
      ],
    },
    take: 100,
    orderBy: { nextHealthCheckAt: "asc" },
  });
  for (const p of due) {
    const id = `health-${p.id}-${p.nextHealthCheckAt?.getTime() ?? 0}`;
    const existing = await healthQueue.getJob(id);
    if (existing && (await existing.getState()) === "failed")
      await existing.retry();
    else
      await healthQueue.add(
        "probe",
        { projectId: p.id, url: p.productionUrl },
        { jobId: id },
      );
  }
}
export async function markOverdue() {
  await db.revocation.updateMany({
    where: {
      deletionDeclaredAt: null,
      deletionDeadlineAt: { lt: new Date() },
      status: { in: ["PENDING_NOTIFICATION", "AWAITING_DELETION"] },
    },
    data: { status: "OVERDUE" },
  });
}
export async function cleanupTechnicalRecords() {
  // Business/evidence retention needs its own approved policy; only short-lived operational records here.
  await db.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 86400000) } },
  });
  // Bounded batches avoid holding a large table lock in normal operation.
  await db.$executeRaw`DELETE FROM health_checks WHERE id IN (SELECT id FROM health_checks WHERE checked_at < NOW() - INTERVAL '30 days' ORDER BY checked_at LIMIT 1000)`;
}
