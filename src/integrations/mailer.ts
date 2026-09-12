import nodemailer from "nodemailer";
import { env } from "../config/env.js";
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
export async function sendDeletionMail(
  to: string,
  text: string,
  messageId: string,
) {
  if (!env.SMTP_HOST || !env.MAIL_FROM) throw new Error("SMTP_NOT_CONFIGURED");
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.NODE_ENV === "production",
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const info = await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: "Hello Cliente — solicitação de exclusão de dados",
    text,
    messageId,
  });
  if (!info.accepted.length) throw new Error("SMTP_NOT_ACCEPTED");
  return String(info.messageId);
}
export function closeMailer() {
  transport?.close();
}
