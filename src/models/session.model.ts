import { db } from "../config/database.js";
export const sessionModel = {
  findForAuthentication: (id: string) =>
    db.session.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true } } },
    }),
};
