import type { Request, Response } from "express";
import { z } from "zod";
import { uuid, pagination } from "../validators/common.js";
import * as service from "../services/match.service.js";
export const matchController = {
  adopt: async (req: Request, res: Response) => {
    const body = z
      .object({
        projectId: uuid,
        termsVersion: z.literal("1.0"),
        acceptTerms: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const result = await service.adoptProject(req.actor!.id, body.projectId);
    res.status(result.created ? 201 : 200).json({ data: result });
  },
  mine: async (req: Request, res: Response) => {
    const { page, limit, status } = pagination
      .extend({ status: z.enum(["ACTIVE", "REVOKED"]).optional() })
      .parse(req.query);
    res.json({
      data: await service.listMerchantMatches(
        req.actor!.id,
        page,
        limit,
        status,
      ),
    });
  },
  revoke: async (req: Request, res: Response) => {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    const r = await service.revokeMatch(
      req.actor!.id,
      uuid.parse(req.params.id),
    );
    res.json({
      data: {
        id: r.id,
        matchId: r.matchId,
        status: r.status,
        requestedAt: r.requestedAt,
        deletionDeadlineAt: r.deletionDeadlineAt,
      },
    });
  },
  revocations: async (req: Request, res: Response) => {
    const { page, limit } = pagination.parse(req.query);
    res.json({
      data: await service.listDeveloperRevocations(req.actor!.id, page, limit),
    });
  },
  declare: async (req: Request, res: Response) => {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    const r = await service.declareDeletion(
      req.actor!.id,
      uuid.parse(req.params.id),
    );
    res.json({
      data: {
        id: r.id,
        status: r.status,
        deletionDeclaredAt: r.deletionDeclaredAt,
      },
    });
  },
};
