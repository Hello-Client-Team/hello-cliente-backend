import type { Prisma } from "../generated/prisma/client.js";
import { db } from "../config/database.js";
import { accessToken, hashToken, randomToken } from "../security/tokens.js";
import { serializable } from "../shared/transaction.js";
import { AppError } from "../shared/errors.js";
const duration = 7 * 24 * 60 * 60 * 1000;
export async function issueSession(
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const refreshToken = randomToken();
  const session = await client.session.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + duration),
    },
  });
  return {
    accessToken: accessToken(userId, session.id),
    refreshToken,
    expiresIn: 900,
  };
}
export async function rotateSession(token: string) {
  return serializable(async (tx) => {
    const s = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!s || s.revokedAt || s.expiresAt <= new Date())
      throw new AppError(401, "UNAUTHORIZED", "Sessão inválida ou expirada.");
    await tx.session.update({
      where: { id: s.id },
      data: { revokedAt: new Date() },
    });
    return issueSession(s.userId, tx);
  });
}
export async function endSession(token: string) {
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
