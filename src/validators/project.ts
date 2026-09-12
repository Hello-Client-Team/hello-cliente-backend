import { z } from "zod";
import { pagination, publicUrl } from "./common.js";
export const category = z.enum([
  "Vendas",
  "Agendamento",
  "Estoque",
  "Financeiro",
  "Atendimento",
]);
export const projectInput = z
  .object({
    title: z.string().trim().min(3).max(160),
    category,
    description: z.string().trim().min(30).max(5000),
    productionUrl: publicUrl,
    demoUrl: publicUrl,
  })
  .strict();
export const catalogQuery = pagination
  .extend({
    category: category.optional(),
    q: z.string().trim().max(120).optional(),
    sort: z.enum(["recent", "name"]).default("recent"),
  })
  .strict();
export const moderationInput = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    justification: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (v) => v.decision !== "REJECTED" || !!v.justification,
    "Justificativa obrigatória para rejeição.",
  );
export const adminQuery = pagination
  .extend({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  })
  .strict();
