import { User } from "@prisma/client";
import { prisma } from "../db/prisma";

/**
 * Thin data-access layer. Controllers go through repositories so the Prisma
 * surface area stays out of business logic - mirrors Laravel Eloquent usage
 * patterns from app/Repositories/*.
 */

export const userRepository = {
  findByEmail(email: string): Promise<User | null> {
    return prisma().user.findUnique({ where: { email: email.toLowerCase() } });
  },
  findById(id: bigint): Promise<User | null> {
    return prisma().user.findUnique({ where: { id } });
  },
};
