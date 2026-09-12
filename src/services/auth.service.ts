import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "../config/database.js";
import {
  registration,
  merchantLogin,
  adminLogin,
} from "../validators/auth.js";
import { checkLimit } from "../security/rate-limit.js";
import { randomToken } from "../security/tokens.js";
import { AppError } from "../shared/errors.js";
import { issueSession } from "./session.service.js";
import { userView } from "../views/user.view.js";
const dummyHash = await bcrypt.hash(randomToken(), 12);
export async function registerMerchant(input: z.infer<typeof registration>) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({
    data: {
      name: input.name,
      role: "MERCHANT",
      signupTermsVersion: input.termsVersion,
      signupTermsAcceptedAt: new Date(),
      merchant: {
        create: {
          whatsapp: input.whatsapp,
          passwordHash,
          whatsappVerifiedAt: null,
          businessName: input.businessName,
          businessSector: input.businessSector,
        },
      },
    },
  });
  return { ...(await issueSession(user.id)), user: userView(user) };
}
export async function loginMerchant(input: z.infer<typeof merchantLogin>) {
  await checkLimit(`login:${input.whatsapp}`, 10, 900);
  const merchant = await db.merchant.findUnique({
    where: { whatsapp: input.whatsapp },
    include: { user: true },
  });
  const valid = await bcrypt.compare(
    input.password,
    merchant?.passwordHash ?? dummyHash,
  );
  if (!valid || !merchant)
    throw new AppError(401, "INVALID_CREDENTIALS", "Credenciais inválidas.");
  return {
    ...(await issueSession(merchant.userId)),
    user: userView(merchant.user),
  };
}
export async function loginAdmin(input: z.infer<typeof adminLogin>) {
  await checkLimit(`admin-login:${input.email}`, 5, 900);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(
    input.password,
    user?.adminPasswordHash ?? dummyHash,
  );
  if (!valid || !user || user.role !== "ADMIN")
    throw new AppError(401, "INVALID_CREDENTIALS", "Credenciais inválidas.");
  return { ...(await issueSession(user.id)), user: userView(user) };
}
