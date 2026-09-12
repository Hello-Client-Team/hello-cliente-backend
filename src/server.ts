import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db, closeDatabase } from "./config/database.js";
import { redis } from "./config/redis.js";
import { logger } from "./config/logger.js";
await db.$connect();
await redis.connect();
const server = createApp().listen(env.PORT, "0.0.0.0", () =>
  logger.info({ port: env.PORT }, "api_started"),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const forced = setTimeout(() => process.exit(1), 30000);
  forced.unref();
  server.close(async () => {
    await redis.quit();
    await closeDatabase();
    clearTimeout(forced);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
