/** Date-only lifecycle arithmetic remains stable across DST transitions. */
export function lifecycleDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function lifecycleDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addLifecycleDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Scheduler dates follow the configured German university day, stored as date-only UTC. */
export function lifecycleToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return lifecycleDate(`${fields.year}-${fields.month}-${fields.day}`);
}
