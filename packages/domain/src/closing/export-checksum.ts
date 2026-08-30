import { createHash } from 'node:crypto';
import type { ClosingChecklistResult } from './checklist.js';

export interface ExportRunInput {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  checklist: ClosingChecklistResult;
  data: unknown;
}

export interface ExportRunResult {
  checksum: string;
  periodId: string;
}

function canonicalizeForChecksum(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForChecksum(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalizeForChecksum((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

/**
 * Compute a deterministic checksum for an export run.
 * Same period + same data = same checksum, enabling idempotent exports.
 */
export function computeExportChecksum(input: ExportRunInput): ExportRunResult {
  const canonical = JSON.stringify(
    canonicalizeForChecksum({
      periodId: input.periodId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      checklist: input.checklist,
      data: input.data,
    }),
  );

  const checksum = createHash('sha256').update(canonical).digest('hex');

  return { checksum, periodId: input.periodId };
}
