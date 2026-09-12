import { Redis } from "ioredis";
import { env } from "./env.js";
// API commands fail promptly. BullMQ workers get a separate durable connection.
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 5000,
});
redis.on("error", () => {});
export function workerRedis() {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", () => {});
  return connection;
}
