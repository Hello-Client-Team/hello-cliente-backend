import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../shared/errors.js";
import { logger } from "../config/logger.js";
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return _next(error);
  if (error instanceof ZodError) {
    res
      .status(422)
      .json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revise os campos informados.",
          fields: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
      });
    return;
  }
  if (error instanceof AppError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res
        .status(409)
        .json({
          error: {
            code: "CONFLICT",
            message: "Registro já existente ou operação concorrente.",
          },
        });
      return;
    }
    if (error.code === "P2025") {
      res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "Registro não encontrado." },
        });
      return;
    }
  }
  if (error?.type === "entity.too.large") {
    res
      .status(413)
      .json({
        error: { code: "BODY_TOO_LARGE", message: "Conteúdo acima do limite." },
      });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "JSON inválido." } });
    return;
  }
  // Never serialize raw errors, SQL parameters, headers, OAuth codes or bodies.
  logger.error(
    {
      requestId: req.id,
      errorType: error?.constructor?.name ?? "UnknownError",
    },
    "request_failed",
  );
  res
    .status(500)
    .json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Não foi possível concluir a operação.",
      },
    });
};
