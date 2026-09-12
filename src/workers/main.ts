import { Worker } from "bullmq";
import { z } from "zod";
import { db, closeDatabase } from "../config/database.js";
import { logger } from "../config/logger.js";
import { workerRedis, redis } from "../config/redis.js";
import { queueConnection, notificationQueue, healthQueue } from "./queues.js";
import { deliverRevocation } from "./notification.worker.js";
import { checkProject } from "./health.worker.js";
import {
  dispatchOutbox,
  reconcileNotifications,
  scheduleHealthchecks,
  markOverdue,
  cleanupTechnicalRecords,
} from "./dispatcher.js";
import { closeMailer } from "../integrations/mailer.js";
const connection = workerRedis();
await db.$connect();
const notifications = new Worker(
  "hello-notifications",
  async (job) => {
    const { revocationId } = z
      .object({ revocationId: z.string().uuid() })
      .parse(job.data);
    await deliverRevocation(revocationId);
  },
  { connection, concurrency: 3, lockDuration: 60000 },
);
const health = new Worker(
  "hello-healthchecks",
  async (job) => {
    const data = z
      .object({ projectId: z.string().uuid(), url: z.string().url() })
      .parse(job.data);
    await checkProject(data, job.id!);
  },
  { connection, concurrency: 5, lockDuration: 60000 },
);
for (const worker of [notifications, health]) {
  worker.on("failed", (job) =>
    logger.error({ jobId: job?.id, queue: worker.name }, "job_failed"),
  );
  worker.on("error", () =>
    logger.error({ queue: worker.name }, "worker_error"),
  );
}
let stopping = false;
let lastCleanup = 0;
let activeTick: Promise<void> | undefined;
async function tick() {
  if (stopping || activeTick) return;
  activeTick = (async () => {
    try {
      await dispatchOutbox();
      await reconcileNotifications();
      await scheduleHealthchecks();
      await markOverdue();
      if (Date.now() - lastCleanup > 3600000) {
        await cleanupTechnicalRecords();
        lastCleanup = Date.now();
      }
    } catch {
      logger.error("dispatcher_tick_failed");
    }
  })();
  await activeTick;
  activeTick = undefined;
}
const timer = setInterval(() => void tick(), 15000);
void tick();
logger.info("workers_started");
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const forced = setTimeout(() => process.exit(1), 30000);
  forced.unref();
  await activeTick;
  await Promise.all([notifications.close(), health.close()]);
  await Promise.all([notificationQueue.close(), healthQueue.close()]);
  await connection.quit();
  await queueConnection.quit();
  if (redis.status !== "wait") await redis.quit();
  closeMailer();
  await closeDatabase();
  clearTimeout(forced);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
