import { randomUUID, createHash } from "node:crypto";
import { db } from "../config/database.js";
import { serializable } from "../shared/transaction.js";
import { AppError, notFound } from "../shared/errors.js";
export function deletionDeadline(now: Date) {
  return new Date(now.getTime() + 48 * 3600000);
}
export async function adoptProject(merchantId: string, projectId: string) {
  return serializable(async (tx) => {
    // Serialize adoption, revocation and readoption for this merchant, including phantom rows.
    await tx.$queryRaw`SELECT user_id FROM merchants WHERE user_id = ${merchantId}::uuid FOR UPDATE`;
    const p = await tx.project.findUnique({ where: { id: projectId } });
    if (!p || p.status !== "APPROVED")
      throw new AppError(
        409,
        "PROJECT_UNAVAILABLE",
        "Projeto indisponível para adoção.",
      );
    const active = await tx.match.findFirst({
      where: { merchantId, projectId, status: "ACTIVE" },
    });
    if (active)
      return {
        match: active,
        redirectUrl: active.productionUrlSnapshot,
        created: false,
      };
    const unresolved = await tx.revocation.count({
      where: { deletionDeclaredAt: null, match: { merchantId, projectId } },
    });
    if (unresolved)
      throw new AppError(
        409,
        "DELETION_PENDING",
        "Aguarde a conclusão da exclusão anterior antes de readotar.",
      );
    const now = new Date();
    const match = await tx.match.create({
      data: {
        merchantId,
        projectId,
        termsVersion: "1.0",
        termsAcceptedAt: now,
        adoptedAt: now,
        productionUrlSnapshot: p.productionUrl,
      },
    });
    return { match, redirectUrl: match.productionUrlSnapshot, created: true };
  });
}
export async function revokeMatch(merchantId: string, id: string) {
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM merchants WHERE user_id = ${merchantId}::uuid FOR UPDATE`;
    const match = await tx.match.findFirst({
      where: { id, merchantId },
      include: {
        revocation: true,
        merchant: { include: { user: true } },
        project: { include: { developer: true } },
      },
    });
    if (!match) throw notFound();
    if (match.revocation) return match.revocation;
    const recipientEmail = match.project.developer.email;
    if (!recipientEmail)
      throw new AppError(
        409,
        "DEVELOPER_CONTACT_MISSING",
        "O desenvolvedor precisa regularizar o contato de notificação.",
      );
    const now = new Date(),
      deadline = deletionDeadline(now),
      revocationId = randomUUID();
    const body = [
      "Hello Cliente — solicitação de exclusão de dados",
      `Solicitação: ${revocationId}`,
      `Projeto: ${match.project.title}`,
      `URL adotada: ${match.productionUrlSnapshot}`,
      `Match: ${match.id}`,
      `Lojista: ${merchantId}`,
      `Negócio: ${match.merchant.businessName}`,
      `WhatsApp de identificação: ${match.merchant.whatsapp}`,
      `Solicitado em: ${now.toISOString()}`,
      `Prazo contratual configurado: ${deadline.toISOString()} (48 horas)`,
      "Exclua os dados correspondentes deste lojista no sistema externo e declare a conclusão no painel do desenvolvedor.",
      "A exclusão deve respeitar o escopo da solicitação e as obrigações de retenção aplicáveis. Não responda com dados pessoais neste e-mail.",
    ].join("\n");
    await tx.match.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: now },
    });
    return tx.revocation.create({
      data: {
        id: revocationId,
        matchId: id,
        requestedAt: now,
        deletionDeadlineAt: deadline,
        recipientEmail,
        notificationVersion: "1.0",
        notificationBody: body,
        evidenceReference: `sha256:${createHash("sha256").update(body).digest("hex")}`,
        events: {
          create: { type: "merchant.revoked.v1", payload: { revocationId } },
        },
      },
    });
  });
}
export async function listMerchantMatches(
  merchantId: string,
  page: number,
  limit: number,
) {
  const where = { merchantId };
  const [items, total] = await Promise.all([
    db.match.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { adoptedAt: "desc" },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            category: true,
            status: true,
            developer: { select: { id: true, name: true } },
          },
        },
        revocation: {
          select: {
            id: true,
            status: true,
            requestedAt: true,
            deletionDeadlineAt: true,
            deletionDeclaredAt: true,
            notificationAcceptedAt: true,
          },
        },
      },
    }),
    db.match.count({ where }),
  ]);
  return { items, total, page, limit };
}
export async function listDeveloperRevocations(
  developerId: string,
  page: number,
  limit: number,
) {
  const where = { match: { project: { developerId } } };
  const [items, total] = await Promise.all([
    db.revocation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { requestedAt: "desc" },
      include: {
        match: {
          select: {
            id: true,
            merchantId: true,
            productionUrlSnapshot: true,
            merchant: { select: { businessName: true, whatsapp: true } },
            project: { select: { id: true, title: true } },
          },
        },
      },
    }),
    db.revocation.count({ where }),
  ]);
  return { items, total, page, limit };
}
export async function declareDeletion(developerId: string, id: string) {
  return serializable(async (tx) => {
    const r = await tx.revocation.findFirst({
      where: { id, match: { project: { developerId } } },
    });
    if (!r) throw notFound();
    if (r.deletionDeclaredAt) return r;
    return tx.revocation.update({
      where: { id },
      data: { status: "DECLARED_DELETED", deletionDeclaredAt: new Date() },
    });
  });
}
