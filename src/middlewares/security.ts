import type { RequestHandler } from "express";
import { allowedOrigins } from "../config/env.js";
import { checkLimit } from "../security/rate-limit.js";
import { AppError } from "../shared/errors.js";
// Mandatory Origin on cookie-based operations prevents CSRF, including cross-site deployments.
export const trustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin");
  if (!origin || !allowedOrigins.has(origin))
    throw new AppError(403, "UNTRUSTED_ORIGIN", "Origem não autorizada.");
  next();
};
export function rateLimit(
  prefix: string,
  limit: number,
  seconds: number,
): RequestHandler {
  return async (req, res, next) => {
    try {
      await checkLimit(`${prefix}:${req.ip}`, limit, seconds);
      next();
    } catch (e) {
      if (e instanceof AppError && e.status === 429)
        res.setHeader("Retry-After", seconds);
      throw e;
    }
  };
}
