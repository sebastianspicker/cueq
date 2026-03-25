/**
 * Shared date parsing utilities.
 *
 * Single source of truth for all date string → Date/timestamp conversions
 * across @cueq/core, @cueq/policy, and consumers.
 */

/**
 * Parse a full ISO-8601 datetime string (e.g. "2026-03-01T08:00:00.000Z").
 * Throws if the input is not a valid date.
 */
export function parseIsoDateTime(input: string): Date {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime: ${input}`);
  }
  return date;
}

/**
 * Parse a date-only string (e.g. "2026-03-01") by appending T00:00:00.000Z.
 * Throws if the input is not a valid date.
 */
export function parseDateOnly(input: string): Date {
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return date;
}

/**
 * Parse either a full ISO datetime or a date-only string.
 * Detects format by the presence of "T" in the input.
 */
export function parseDateOrDateTime(input: string): Date {
  return input.includes('T') ? parseIsoDateTime(input) : parseDateOnly(input);
}

/**
 * Parse a date-only string and return its UTC timestamp (milliseconds).
 * Useful for range comparisons in policy catalog lookups.
 */
export function parseDateOnlyToTimestamp(input: string): number {
  return parseDateOnly(input).getTime();
}

/**
 * Build a Set<string> from an optional array of date strings (YYYY-MM-DD).
 * Returns an empty set when the input is undefined or empty.
 */
export function toHolidaySet(dates?: string[]): Set<string> {
  return new Set(dates ?? []);
}
