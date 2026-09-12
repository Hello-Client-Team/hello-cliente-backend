import type { RequestHandler } from "express";
import { sessionModel } from "../models/session.model.js";
import { verifyAccessToken } from "../security/tokens.js";
import { AppError } from "../shared/errors.js";
export const authenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new AppError(401, "UNAUTHORIZED", "Autenticação necessária.");
  const claims = verifyAccessToken(authorization.slice(7));
  const session = await sessionModel.findForAuthentication(claims.sessionId);
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  )
    throw new AppError(401, "UNAUTHORIZED", "Sessão inválida ou expirada.");
  req.actor = {
    id: session.user.id,
    role: session.user.role,
    sessionId: session.id,
  };
  next();
};
export function requireRole(
  ...roles: NonNullable<Express.Request["actor"]>["role"][]
): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor || !roles.includes(req.actor.role))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Este perfil não tem permissão para esta ação.",
      );
    next();
  };
}
