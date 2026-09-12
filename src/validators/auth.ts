import { z } from "zod";
import { password, phone, email } from "./common.js";
export const registration = z
  .object({
    name: z.string().trim().min(3).max(150),
    whatsapp: phone,
    password,
    businessName: z.string().trim().min(2).max(180),
    businessSector: z.string().trim().min(2).max(100),
    termsVersion: z.literal("1.0"),
  })
  .strict();
export const merchantLogin = z
  .object({
    whatsapp: phone,
    password: z
      .string()
      .min(1)
      .refine((v) => Buffer.byteLength(v) <= 72),
  })
  .strict();
export const adminLogin = z
  .object({
    email,
    password: z
      .string()
      .min(1)
      .refine((v) => Buffer.byteLength(v) <= 72),
  })
  .strict();
