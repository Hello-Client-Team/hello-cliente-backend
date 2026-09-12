import { Queue } from "bullmq";
import { workerRedis } from "../config/redis.js";
export const queueConnection = workerRedis();
export const notificationQueue = new Queue("hello-notifications", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: { age: 604800, count: 10000 },
  },
});
export const healthQueue = new Queue("hello-healthchecks", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: true,
    removeOnFail: { age: 86400, count: 1000 },
  },
});
