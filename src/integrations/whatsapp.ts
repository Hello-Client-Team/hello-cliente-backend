import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";
const responseSchema = z.object({ status: z.string() });
async function request(path: string, body: URLSearchParams) {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_VERIFY_SERVICE_SID
  )
    throw new AppError(
      503,
      "WHATSAPP_UNAVAILABLE",
      "Verificação por WhatsApp ainda não configurada.",
    );
  const service = encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID);
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${service}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status === 404) return { status: "invalid" };
  if (!response.ok)
    throw new AppError(
      503,
      "WHATSAPP_UNAVAILABLE",
      "Não foi possível processar a verificação. Tente mais tarde.",
    );
  return responseSchema.parse(await response.json());
}
export const whatsapp = {
  send: async (phone: string) => {
    await request(
      "Verifications",
      new URLSearchParams({ To: phone, Channel: "whatsapp" }),
    );
  },
  verify: async (phone: string, code: string) => {
    const result = await request(
      "VerificationCheck",
      new URLSearchParams({ To: phone, Code: code }),
    );
    if (result.status !== "approved")
      throw new AppError(
        400,
        "INVALID_VERIFICATION",
        "Código inválido ou expirado.",
      );
  },
};
