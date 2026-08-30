import type { SurchargeCategory } from '@cueq/policy';
import { WORK_INTERVAL_TYPES } from '../constants.js';

const SURCHARGE_TIE_BREAK: Record<SurchargeCategory, number> = {
  HOLIDAY: 3,
  WEEKEND: 2,
  NIGHT: 1,
};

/** Identify interval categories that contribute productive work minutes. */
export function isWorkIntervalType(type: string): boolean {
  return WORK_INTERVAL_TYPES.has(type);
}

/** Select one surcharge category by configured priority and a stable fallback tie-break. */
export function selectSurchargeCategory(
  categories: SurchargeCategory[],
  configByCategory: ReadonlyMap<SurchargeCategory, { priority: number }>,
): SurchargeCategory | null {
  if (categories.length === 0) return null;

  return (
    [...categories].sort((left, right) => {
      const leftPriority = configByCategory.get(left)?.priority ?? 0;
      const rightPriority = configByCategory.get(right)?.priority ?? 0;
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      return SURCHARGE_TIE_BREAK[right] - SURCHARGE_TIE_BREAK[left];
    })[0] ?? null
  );
}
