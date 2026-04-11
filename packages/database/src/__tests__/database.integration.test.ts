import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

import { prisma } from '../index';

describe('@cueq/database integration', () => {
  it('can execute a raw connectivity query', async () => {
    const result = await prisma.$queryRaw<{ value: number }[]>`SELECT 1::int as value`;
    expect(result[0]?.value).toBe(1);
  });
});
