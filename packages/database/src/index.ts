/**
 * @cueq/database — Prisma client re-export
 *
 * This package exports the Prisma client singleton for use across
 * the monorepo. Import from `@cueq/database` instead of importing
 * `@prisma/client` directly.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export * from '@prisma/client';
