import { randomUUID } from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { routes } from "./routes/index.js";
import { docsRoutes } from "./routes/docs.js";
import { env, allowedOrigins } from "./config/env.js";
import { logger } from "./config/logger.js";
import { db } from "./config/database.js";
import { redis } from "./config/redis.js";
import { rateLimit } from "./middlewares/security.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { AppError } from "./shared/errors.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set(
    "trust proxy",
    env.TRUST_PROXY ? env.TRUST_PROXY.split(",").map((v) => v.trim()) : false,
  );
  app.set("query parser", "simple");
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          path: (req.url ?? "").split("?")[0],
        }),
        res: (res) => ({ statusCode: res.statusCode }),
        err: () => ({ message: "request_failed" }),
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) callback(null, true);
        else
          callback(
            new AppError(403, "UNTRUSTED_ORIGIN", "Origem não autorizada."),
          );
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  app.use("/docs", docsRoutes);
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use(express.json({ limit: "32kb", strict: true }), cookieParser());
  app.use("/api/v1", rateLimit("api", 120, 60), routes);
  app.use((_req, _res) => {
    throw new AppError(404, "NOT_FOUND", "Rota não encontrada.");
  });
  app.use(errorHandler);
  return app;
}
