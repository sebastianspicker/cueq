/** Provides workflow timestamp serialization and deadline calculation. */

/** Serializes workflow timestamps consistently for API and audit payloads. */
export function toIso(date: Date): string {
  return date.toISOString();
}

/** Advances a workflow deadline by the policy's hour interval. */
export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}
