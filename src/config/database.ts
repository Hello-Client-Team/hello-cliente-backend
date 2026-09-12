import { readFileSync } from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
// Remove URL SSL overrides: TLS policy is configured explicitly below.
const url = new URL(env.DATABASE_URL);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
  url.searchParams.delete(key);
const pool = new pg.Pool({
  connectionString: url.toString(),
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ssl: env.DB_SSL
    ? {
        rejectUnauthorized: true,
        ...(env.DB_SSL_CA_FILE
          ? { ca: readFileSync(env.DB_SSL_CA_FILE, "utf8") }
          : {}),
      }
    : false,
});
export const db = new PrismaClient({ adapter: new PrismaPg(pool), log: [] });
export async function closeDatabase() {
  await db.$disconnect();
  await pool.end();
}
