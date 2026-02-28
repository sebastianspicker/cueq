/**
 * @cueq/database — Prisma client re-export
 *
 * This package exports the Prisma client singleton for use across
 * the monorepo. Import from `@cueq/database` instead of importing
 * `@prisma/client` directly.
 */

export { PrismaClient } from '@prisma/client';
export type * from '@prisma/client';
