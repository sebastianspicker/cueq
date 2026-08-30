/** Utilities for validated ISO instant comparison, elapsed time, and serialization. */
import { parseIsoDateTime } from './date-parsing.js';

/** Calculate elapsed hours between two validated ISO instants. */
export function diffHours(startIso: string, endIso: string): number {
  const start = parseIsoDateTime(startIso);
  const end = parseIsoDateTime(endIso);
  return (end.getTime() - start.getTime()) / 3_600_000;
}

/** Compare validated ISO datetime strings by instant rather than textual precision. */
export function compareIsoInstants(leftIso: string, rightIso: string): number {
  return parseIsoDateTime(leftIso).getTime() - parseIsoDateTime(rightIso).getTime();
}

/** Serialize a date to the canonical ISO instant used by domain outputs. */
export function toIso(date = new Date()): string {
  return date.toISOString();
}
