import type { User } from "../generated/prisma/client.js";
export function userView(user: User) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}
