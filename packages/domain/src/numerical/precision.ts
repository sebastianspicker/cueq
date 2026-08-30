/** Numeric precision conventions used by public domain calculations. */

/** Round hour and day outputs to the precision used by public domain contracts. */
export function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
