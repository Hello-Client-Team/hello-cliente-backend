import type { Request, Response, CookieOptions } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";
import * as schema from "../validators/auth.js";
import * as auth from "../services/auth.service.js";
import { endSession, rotateSession } from "../services/session.service.js";
import { finishOAuth, startOAuth } from "../services/oauth.service.js";
const cookie: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.COOKIE_SAME_SITE,
  path: "/api/v1/auth",
  maxAge: 7 * 86400000,
};
function respondSession(
  res: Response,
  value: Awaited<ReturnType<typeof rotateSession>>,
  status = 200,
) {
  const { refreshToken, ...data } = value;
  res.cookie("hc_refresh", refreshToken, cookie).status(status).json({ data });
}
export const authController = {
  verification: (_req: Request, _res: Response) => {
    throw new AppError(503, "VERIFICATION_DISABLED", "A verificação de WhatsApp está desativada. Cadastre-se diretamente.");
  },
  register: async (req: Request, res: Response) =>
    respondSession(
      res,
      await auth.registerMerchant(schema.registration.parse(req.body)),
      201,
    ),
  login: async (req: Request, res: Response) =>
    respondSession(
      res,
      await auth.loginMerchant(schema.merchantLogin.parse(req.body)),
    ),
  admin: async (req: Request, res: Response) =>
    respondSession(
      res,
      await auth.loginAdmin(schema.adminLogin.parse(req.body)),
    ),
  reset: (_req: Request, _res: Response) => {
    throw new AppError(503, "PASSWORD_RESET_DISABLED", "A recuperação de senha está temporariamente indisponível.");
  },
  refresh: async (req: Request, res: Response) => {
    const token = z.string().min(32).max(100).safeParse(req.cookies.hc_refresh);
    if (!token.success)
      throw new AppError(401, "UNAUTHORIZED", "Sessão ausente.");
    respondSession(res, await rotateSession(token.data));
  },
  logout: async (req: Request, res: Response) => {
    if (typeof req.cookies.hc_refresh === "string")
      await endSession(req.cookies.hc_refresh);
    res
      .clearCookie("hc_refresh", { ...cookie, maxAge: undefined })
      .status(204)
      .end();
  },
  oauthStart: async (req: Request, res: Response) => {
    const provider = z.enum(["github", "linkedin"]).parse(req.params.provider);
    const result = await startOAuth(provider);
    res
      .cookie("hc_oauth_state", result.state, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/v1/auth/oauth",
        maxAge: 600000,
      })
      .redirect(result.url);
  },
  oauthLink: async (req: Request, res: Response) => {
    const provider = z.enum(["github", "linkedin"]).parse(req.params.provider);
    z.object({}).strict().parse(req.body ?? {});
    const result = await startOAuth(provider, {
      userId: req.actor!.id, sessionId: req.actor!.sessionId,
    });
    res.cookie("hc_oauth_state", result.state, {
      httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax",
      path: "/api/v1/auth/oauth", maxAge: 600000,
    }).json({ data: { authorizationUrl: result.url } });
  },
  oauthCallback: async (req: Request, res: Response) => {
    const provider = z.enum(["github", "linkedin"]).parse(req.params.provider);
    const query = z
      .object({
        code: z.string().min(1).max(2048),
        state: z.string().min(32).max(100),
      })
      .parse(req.query);
    if (req.cookies.hc_oauth_state !== query.state)
      throw new AppError(400, "INVALID_OAUTH_STATE", "Autorização inválida.");
    res.clearCookie("hc_oauth_state", {
      path: "/api/v1/auth/oauth",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    });
    const session = await finishOAuth(provider, query.code, query.state);
    if (session.linked) {
      res.redirect(`${env.FRONTEND_URL}/entrar/?oauth=linked`);
      return;
    }
    res
      .cookie("hc_refresh", session.refreshToken, cookie)
      .redirect(`${env.FRONTEND_URL}/entrar/?oauth=success`);
  },
};
