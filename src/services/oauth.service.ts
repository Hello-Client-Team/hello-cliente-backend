import { z } from "zod";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";
import { randomToken, hashToken } from "../security/tokens.js";
import { AppError } from "../shared/errors.js";
import { issueSession } from "./session.service.js";
import { serializable } from "../shared/transaction.js";
export type Provider = "github" | "linkedin";
function config(provider: Provider) {
  const github = provider === "github";
  const clientId = github ? env.GITHUB_CLIENT_ID : env.LINKEDIN_CLIENT_ID;
  const clientSecret = github
    ? env.GITHUB_CLIENT_SECRET
    : env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new AppError(
      503,
      "OAUTH_UNAVAILABLE",
      "Este provedor ainda não está configurado.",
    );
  return {
    clientId,
    clientSecret,
    callback: `${env.API_URL}/api/v1/auth/oauth/${provider}/callback`,
  };
}
export async function startOAuth(provider: Provider, link?: { userId: string; sessionId: string }) {
  const c = config(provider),
    state = randomToken(),
    verifier = randomToken();
  await redis.set(
    `oauth:${hashToken(state)}`,
    JSON.stringify({ provider, verifier, link }),
    "EX",
    600,
  );
  const url = new URL(
    provider === "github"
      ? "https://github.com/login/oauth/authorize"
      : "https://www.linkedin.com/oauth/v2/authorization",
  );
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.callback,
    response_type: "code",
    scope:
      provider === "github" ? "read:user user:email" : "openid profile email",
    state,
    ...(provider === "github"
      ? {
          code_challenge: Buffer.from(hashToken(verifier), "hex").toString(
            "base64url",
          ),
          code_challenge_method: "S256",
        }
      : {}),
  }).toString();
  return { url: url.href, state };
}
async function jsonRequest(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!res.ok)
    throw new AppError(
      502,
      "OAUTH_PROVIDER_ERROR",
      "Falha de comunicação com o provedor de identidade.",
    );
  return res.json() as Promise<unknown>;
}
export async function finishOAuth(
  provider: Provider,
  code: string,
  state: string,
) {
  const raw = await redis.getdel(`oauth:${hashToken(state)}`);
  if (!raw)
    throw new AppError(
      400,
      "INVALID_OAUTH_STATE",
      "Autorização expirada. Inicie o login novamente.",
    );
  const saved = z
    .object({ provider: z.enum(["github", "linkedin"]), verifier: z.string(),
      link: z.object({ userId: z.string(), sessionId: z.string() }).optional() })
    .parse(JSON.parse(raw));
  if (saved.provider !== provider)
    throw new AppError(400, "INVALID_OAUTH_STATE", "Provedor inválido.");
  const c = config(provider);
  const token = z
    .object({ access_token: z.string() })
    .parse(
      await jsonRequest(
        provider === "github"
          ? "https://github.com/login/oauth/access_token"
          : "https://www.linkedin.com/oauth/v2/accessToken",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: c.clientId,
            client_secret: c.clientSecret,
            code,
            redirect_uri: c.callback,
            grant_type: "authorization_code",
            ...(provider === "github" ? { code_verifier: saved.verifier } : {}),
          }),
        },
      ),
    );
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
    "User-Agent": "Hello-Cliente",
  };
  let accountId: string, name: string, email: string;
  if (provider === "github") {
    const profile = z
      .object({
        id: z.number(),
        login: z.string(),
        name: z.string().nullable(),
      })
      .parse(await jsonRequest("https://api.github.com/user", { headers }));
    const emails = z
      .array(
        z.object({
          email: z.string().email(),
          verified: z.boolean(),
          primary: z.boolean(),
        }),
      )
      .parse(
        await jsonRequest("https://api.github.com/user/emails", { headers }),
      );
    const verified =
      emails.find((e) => e.verified && e.primary) ??
      emails.find((e) => e.verified);
    if (!verified)
      throw new AppError(
        422,
        "VERIFIED_EMAIL_REQUIRED",
        "Verifique um e-mail no GitHub para continuar.",
      );
    accountId = String(profile.id);
    name = profile.name ?? profile.login;
    email = verified.email.toLowerCase();
  } else {
    const profile = z
      .object({
        sub: z.string(),
        name: z.string(),
        email: z.string().email(),
        email_verified: z.literal(true),
      })
      .safeParse(
        await jsonRequest("https://api.linkedin.com/v2/userinfo", { headers }),
      );
    if (!profile.success)
      throw new AppError(
        422,
        "VERIFIED_EMAIL_REQUIRED",
        "O LinkedIn precisa fornecer um e-mail verificado.",
      );
    accountId = profile.data.sub;
    name = profile.data.name;
    email = profile.data.email.toLowerCase();
  }
  const providerEnum = provider === "github" ? "GITHUB" : "LINKEDIN";
  if (saved.link) {
    const link = saved.link;
    await serializable(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: link.sessionId }, include: { user: true },
      });
      if (!session || session.userId !== link.userId || session.revokedAt ||
          session.expiresAt <= new Date())
        throw new AppError(401, "UNAUTHORIZED", "Sessão inválida ou expirada. Inicie a vinculação novamente.");
      if (session.user.role !== "DEVELOPER")
        throw new AppError(403, "FORBIDDEN", "Somente desenvolvedores podem vincular provedores.");
      const existing = await tx.oAuthAccount.findUnique({ where: {
        provider_providerAccountId: { provider: providerEnum, providerAccountId: accountId },
      } });
      if (existing && existing.userId !== link.userId)
        throw new AppError(409, "OAUTH_ACCOUNT_IN_USE", "Este provedor já está vinculado a outra conta.");
      const emailOwner = await tx.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== link.userId)
        throw new AppError(409, "ACCOUNT_LINK_REQUIRED", "Este e-mail pertence a outra conta. As contas não foram unidas.");
      if (!existing) await tx.oAuthAccount.create({ data: {
        userId: link.userId, provider: providerEnum, providerAccountId: accountId,
      } });
    });
    return { linked: true as const };
  }
  let account = await db.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: providerEnum,
        providerAccountId: accountId,
      },
    },
    include: { user: true },
  });
  if (!account) {
    // Never merge users based on an email reported by another identity provider.
    if (await db.user.findUnique({ where: { email } }))
      throw new AppError(
        409,
        "ACCOUNT_LINK_REQUIRED",
        "Este e-mail já está associado a uma conta. Entre pelo provedor original.",
      );
    account = await db.oAuthAccount.create({
      data: {
        provider: providerEnum,
        providerAccountId: accountId,
        user: {
          create: {
            name: name.slice(0, 150),
            email,
            emailVerifiedAt: new Date(),
            role: "DEVELOPER",
          },
        },
      },
      include: { user: true },
    });
  }
  if (account.user.role !== "DEVELOPER")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Conta não autorizada para este fluxo.",
    );
  return { linked: false as const, ...(await issueSession(account.userId)) };
}
