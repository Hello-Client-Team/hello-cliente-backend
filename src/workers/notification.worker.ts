import { db } from "../config/database.js";
import { sendDeletionMail } from "../integrations/mailer.js";
import { env } from "../config/env.js";
export async function deliverRevocation(revocationId: string) {
  const revocation = await db.revocation.findUniqueOrThrow({
    where: { id: revocationId },
  });
  if (revocation.notificationAcceptedAt) return;
  const messageId = `<revocation-${revocation.id}@${new URL(env.API_URL).hostname}>`;
  const attempt = await db.notificationAttempt.create({
    data: { revocationId, messageId },
  });
  try {
    const providerId = await sendDeletionMail(
      revocation.recipientEmail,
      revocation.notificationBody,
      messageId,
    );
    await db.$transaction(async (tx) => {
      const current = await tx.revocation.findUniqueOrThrow({
        where: { id: revocationId },
      });
      const now = new Date();
      await tx.notificationAttempt.update({
        where: { id: attempt.id },
        data: { acceptedAt: now },
      });
      await tx.revocation.update({
        where: { id: revocationId },
        data: {
          notificationAcceptedAt: now,
          providerMessageId: providerId,
          status: current.deletionDeclaredAt
            ? "DECLARED_DELETED"
            : current.deletionDeadlineAt < now
              ? "OVERDUE"
              : "AWAITING_DELETION",
        },
      });
    });
  } catch (error) {
    await db.notificationAttempt
      .update({
        where: { id: attempt.id },
        data: { failureCode: "SEND_OR_RECORD_FAILED" },
      })
      .catch(() => {});
    throw error;
  }
}
