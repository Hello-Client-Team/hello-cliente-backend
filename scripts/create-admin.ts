import bcrypt from "bcrypt";
import { z } from "zod";
import { db, closeDatabase } from "../src/config/database.js";
import { email, password } from "../src/validators/common.js";
// Read credentials from the environment, never command arguments or logs.
const input = z
  .object({
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD: password,
    ADMIN_NAME: z.string().min(3).max(150),
  })
  .parse(process.env);
try {
  if (await db.user.findUnique({ where: { email: input.ADMIN_EMAIL } }))
    throw new Error("User already exists; no role or password was changed.");
  await db.user.create({
    data: {
      name: input.ADMIN_NAME,
      email: input.ADMIN_EMAIL,
      role: "ADMIN",
      adminPasswordHash: await bcrypt.hash(input.ADMIN_PASSWORD, 12),
      emailVerifiedAt: new Date(),
    },
  });
  console.info("Admin created.");
} finally {
  await closeDatabase();
}
