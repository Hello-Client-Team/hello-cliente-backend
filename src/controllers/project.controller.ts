import type { Request, Response } from "express";
import { db } from "../config/database.js";
import { z } from "zod";
import { uuid, pagination } from "../validators/common.js";
import {
  projectInput,
  catalogQuery,
  moderationInput,
  adminQuery,
} from "../validators/project.js";
import * as service from "../services/project.service.js";
import { projectModel } from "../models/project.model.js";
import { notFound } from "../shared/errors.js";
export const projectController = {
  operations: async (_req: Request, res: Response) => {
    const [failedEvents, overdue, unnotified] = await Promise.all([
      db.outboxEvent.count({ where: { status: "FAILED" } }),
      db.revocation.count({ where: { status: "OVERDUE" } }),
      db.revocation.count({ where: { notificationAcceptedAt: null } }),
    ]);
    res.json({ data: { failedEvents, overdue, unnotified } });
  },
  list: async (req: Request, res: Response) =>
    res.json({
      data: await service.listCatalog(catalogQuery.parse(req.query)),
    }),
  detail: async (req: Request, res: Response) =>
    res.json({
      data: await service.getPublicProject(uuid.parse(req.params.id)),
    }),
  create: async (req: Request, res: Response) =>
    res
      .status(201)
      .json({
        data: await service.saveProject(
          req.actor!.id,
          projectInput.parse(req.body),
        ),
      }),
  edit: async (req: Request, res: Response) =>
    res.json({
      data: await service.saveProject(
        req.actor!.id,
        projectInput.parse(req.body),
        uuid.parse(req.params.id),
      ),
    }),
  mine: async (req: Request, res: Response) => {
    const { page, limit } = pagination.parse(req.query);
    const [items, total] = await Promise.all([
      projectModel.listOwned(req.actor!.id, (page - 1) * limit, limit),
      projectModel.count({ developerId: req.actor!.id }),
    ]);
    res.json({ data: { items, total, page, limit } });
  },
  adminList: async (req: Request, res: Response) => {
    const { page, limit, status } = adminQuery.parse(req.query),
      where = status ? { status } : {};
    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { developer: { select: { id: true, name: true } } },
      }),
      db.project.count({ where }),
    ]);
    res.json({ data: { items, total, page, limit } });
  },
  moderate: async (req: Request, res: Response) =>
    res.json({
      data: await service.moderateProject(
        req.actor!.id,
        uuid.parse(req.params.id),
        moderationInput.parse(req.body),
      ),
    }),
  history: async (req: Request, res: Response) => {
    const id = uuid.parse(req.params.id);
    if (!(await db.project.findUnique({ where: { id }, select: { id: true } })))
      throw notFound();
    const { page, limit } = pagination.parse(req.query);
    const [checks, moderations] = await Promise.all([
      db.healthCheck.findMany({
        where: { projectId: id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { checkedAt: "desc" },
      }),
      db.moderation.findMany({
        where: { projectId: id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ data: { checks, moderations, page, limit } });
  },
};
