import { z } from "zod";
import { db } from "../config/database.js";
import { projectModel } from "../models/project.model.js";
import {
  catalogQuery,
  projectInput,
  moderationInput,
} from "../validators/project.js";
import { resolvePublic } from "../security/safe-http.js";
import { serializable } from "../shared/transaction.js";
import { AppError, notFound } from "../shared/errors.js";
export async function listCatalog(query: z.infer<typeof catalogQuery>) {
  const where = {
    status: "APPROVED" as const,
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" as const } },
            {
              description: { contains: query.q, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    projectModel.listPublic(
      where,
      (query.page - 1) * query.limit,
      query.limit,
      query.sort === "name" ? { title: "asc" } : { createdAt: "desc" },
    ),
    projectModel.count(where),
  ]);
  return { items, total, page: query.page, limit: query.limit };
}
export async function getPublicProject(id: string) {
  const project = await projectModel.findPublic(id);
  if (!project) throw notFound();
  return project;
}
export async function saveProject(
  developerId: string,
  input: z.infer<typeof projectInput>,
  id?: string,
) {
  await Promise.all([
    resolvePublic(input.productionUrl),
    resolvePublic(input.demoUrl),
  ]);
  const dev = await db.user.findUnique({ where: { id: developerId } });
  if (!dev?.emailVerifiedAt || !dev.email)
    throw new AppError(
      422,
      "VERIFIED_EMAIL_REQUIRED",
      "Um e-mail verificado é necessário para publicar projetos.",
    );
  if (!id)
    return db.project.create({
      data: { ...input, developerId, status: "PENDING" },
    });
  return serializable(async (tx) => {
    const project = await tx.project.findFirst({ where: { id, developerId } });
    if (!project) throw notFound();
    return tx.project.update({
      where: { id },
      data: {
        ...input,
        status: "PENDING",
        suspendedAt: null,
        suspensionReason: null,
        nextHealthCheckAt: null,
        consecutiveFailures: 0,
      },
    });
  });
}
export async function moderateProject(
  administratorId: string,
  id: string,
  input: z.infer<typeof moderationInput>,
) {
  return serializable(async (tx) => {
    const p = await tx.project.findUnique({ where: { id } });
    if (!p) throw notFound();
    // Database history + new status are committed together. Worker performs network checks.
    await tx.moderation.create({
      data: {
        projectId: id,
        administratorId,
        decision: input.decision,
        justification: input.justification,
      },
    });
    return tx.project.update({
      where: { id },
      data: {
        status: input.decision,
        nextHealthCheckAt: input.decision === "APPROVED" ? new Date() : null,
        suspendedAt: null,
        suspensionReason: null,
        consecutiveFailures: 0,
      },
    });
  });
}
