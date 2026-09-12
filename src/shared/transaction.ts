import { Prisma } from "../generated/prisma/client.js";
import { db } from "../config/database.js";
import { AppError } from "./errors.js";
export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt < 2) continue;
        throw new AppError(
          409,
          "CONCURRENT_CHANGE",
          "Outra operação alterou este registro. Tente novamente.",
        );
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}
