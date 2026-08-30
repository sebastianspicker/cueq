import { overlapExists } from '../intervals/overlap.js';
import type { PlausibilityIssue } from '../types.js';

export interface PersonShift {
  personCode: string;
  start: string;
  end: string;
}

export interface ShiftOverlapResult {
  personCode: string;
  issues: PlausibilityIssue[];
}

/**
 * Detect overlapping shifts for each person.
 * Groups shifts by personCode and delegates to interval overlap detection.
 */
export function detectShiftOverlaps(shifts: PersonShift[]): ShiftOverlapResult[] {
  const byPerson = new Map<string, PersonShift[]>();
  for (const shift of shifts) {
    const group = byPerson.get(shift.personCode) ?? [];
    group.push(shift);
    byPerson.set(shift.personCode, group);
  }

  const results: ShiftOverlapResult[] = [];
  for (const [personCode, personShifts] of byPerson) {
    const issues = overlapExists(personShifts);
    if (issues.length > 0) {
      results.push({ personCode, issues });
    }
  }

  return results;
}
