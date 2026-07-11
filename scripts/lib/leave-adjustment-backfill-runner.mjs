import { backfillPersonYear } from './leave-adjustment-backfill.mjs';

export async function runLeaveAdjustmentBackfill(db, input, roles) {
  const people = await db.person.findMany({
    where: { role: { in: roles } },
    select: { id: true },
  });
  let created = 0;
  for (const person of people) {
    if (input.dryRun) {
      const existing = await db.leaveAdjustment.findFirst({
        where: { personId: person.id, year: input.year },
        select: { id: true },
      });
      if (!existing) created += 1;
      continue;
    }
    const result = await backfillPersonYear(db, { ...input, personId: person.id });
    if (result.created) created += 1;
  }
  return { year: input.year, dryRun: input.dryRun, scanned: people.length, created };
}
