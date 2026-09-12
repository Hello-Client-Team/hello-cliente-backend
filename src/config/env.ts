import "dotenv/config";
import { z } from "zod";
const optional = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().optional(),
);
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z
      .string()
      .min(48)
      .refine((v) => !v.startsWith("REPLACE_"), "Generate a random secret"),
    FRONTEND_URL: z.string().url(),
    API_URL: z.string().url(),
    CORS_ORIGINS: z.string().min(1),
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    TRUST_PROXY: optional,
    DB_SSL: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    DB_SSL_CA_FILE: optional,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    MAIL_FROM: optional,
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_VERIFY_SERVICE_SID: optional,
    GITHUB_CLIENT_ID: optional,
    GITHUB_CLIENT_SECRET: optional,
    LINKEDIN_CLIENT_ID: optional,
    LINKEDIN_CLIENT_SECRET: optional,
    HEALTH_INTERVAL_HOURS: z.coerce.number().min(1).max(168).default(6),
    HEALTH_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(3),
    HEALTH_TIMEOUT_MS: z.coerce.number().min(1000).max(30000).default(8000),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production") {
      if (!v.DB_SSL)
        ctx.addIssue({
          code: "custom",
          path: ["DB_SSL"],
          message: "TLS is required",
        });
      for (const key of ["FRONTEND_URL", "API_URL"] as const)
        if (!v[key].startsWith("https://"))
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "HTTPS is required",
          });
    }
    if (v.COOKIE_SAME_SITE === "none" && v.NODE_ENV !== "production")
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SAME_SITE"],
        message: "SameSite=None requires production HTTPS",
      });
    for (const origin of v.CORS_ORIGINS.split(",")) {
      try {
        const u = new URL(origin.trim());
        if (
          u.origin !== origin.trim() ||
          (v.NODE_ENV === "production" && u.protocol !== "https:")
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["CORS_ORIGINS"],
          message: "Use explicit origins without paths or wildcards",
        });
      }
    }
  });
const result = schema.safeParse(process.env);
if (!result.success)
  throw new Error(
    `Invalid environment keys: ${[...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ")}`,
  );
export const env = result.data;
export const allowedOrigins = new Set(
  env.CORS_ORIGINS.split(",").map((v) => v.trim()),
);
