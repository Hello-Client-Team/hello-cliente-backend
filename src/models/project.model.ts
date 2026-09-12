import { db } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
export const publicProjectSelect = {
  id: true,
  title: true,
  category: true,
  description: true,
  demoUrl: true,
  status: true,
  createdAt: true,
  developer: { select: { id: true, name: true } },
} satisfies Prisma.ProjectSelect;
export const projectModel = {
  findPublic: (id: string) =>
    db.project.findFirst({
      where: { id, status: "APPROVED" },
      select: publicProjectSelect,
    }),
  listPublic: (
    where: Prisma.ProjectWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.ProjectOrderByWithRelationInput,
  ) =>
    db.project.findMany({
      where,
      skip,
      take,
      orderBy,
      select: publicProjectSelect,
    }),
  count: (where: Prisma.ProjectWhereInput) => db.project.count({ where }),
  listOwned: (developerId: string, skip: number, take: number) =>
    db.project.findMany({
      where: { developerId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
};
