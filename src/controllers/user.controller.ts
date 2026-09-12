import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/database.js";
import { userView } from "../views/user.view.js";
import { notFound } from "../shared/errors.js";
export const userController = {
  me: async (req: Request, res: Response) => {
    const user = await db.user.findUnique({
      where: { id: req.actor!.id },
      include: {
        merchant: {
          select: {
            businessName: true,
            businessSector: true,
            whatsapp: true,
            whatsappVerifiedAt: true,
          },
        },
      },
    });
    if (!user) throw notFound();
    res.json({ data: { ...userView(user), merchant: user.merchant } });
  },
  update: async (req: Request, res: Response) => {
    const input = z
      .object({
        name: z.string().trim().min(3).max(150),
        businessName: z.string().trim().min(2).max(180).optional(),
        businessSector: z.string().trim().min(2).max(100).optional(),
      })
      .strict()
      .parse(req.body);
    const user = await db.user.update({
      where: { id: req.actor!.id },
      data: {
        name: input.name,
        ...(req.actor!.role === "MERCHANT"
          ? {
              merchant: {
                update: {
                  businessName: input.businessName,
                  businessSector: input.businessSector,
                },
              },
            }
          : {}),
      },
    });
    res.json({ data: userView(user) });
  },
};
