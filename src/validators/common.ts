import { z } from "zod";
export const uuid = z.string().uuid();
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const password = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "A senha deve ter no máximo 72 bytes UTF-8.",
  );
export const phone = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use o formato internacional, por exemplo +5511999999999.",
  );
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const publicUrl = z
  .string()
  .url()
  .max(2048)
  .superRefine((value, ctx) => {
    const u = new URL(value);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.hash ||
      (u.port && !["80", "443"].includes(u.port))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Use HTTP(S), sem credenciais, fragmentos ou portas personalizadas.",
      });
  });
