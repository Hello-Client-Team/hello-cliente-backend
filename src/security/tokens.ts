import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";
export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const issuer = "hello-cliente-api",
  audience = "hello-cliente-web";
export function accessToken(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    issuer,
    audience,
    expiresIn: "15m",
  });
}
export function verifyAccessToken(token: string) {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    if (
      typeof claims === "string" ||
      typeof claims.sub !== "string" ||
      typeof claims.sid !== "string"
    )
      throw new Error();
    return { userId: claims.sub, sessionId: claims.sid };
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Sessão inválida ou expirada.");
  }
}
