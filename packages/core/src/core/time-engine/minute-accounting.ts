import type { SurchargeCategory, SurchargeRule } from '@cueq/policy';
import { isWithinWindow, localMinuteInfo, selectSurchargeCategory } from './surcharge';
import type { TimeRuleInterval } from './types';

const MINUTE_MS = 60_000;

export type DailyTotals = { workMinutes: number; pauseMinutes: number };
export type SurchargeCategoryConfig = SurchargeRule['categories'][number];
export type CategoryConfigByCategory = Map<SurchargeCategory, SurchargeCategoryConfig>;

function surchargeCategoryForMinute(
  localMinute: ReturnType<typeof localMinuteInfo>,
  holidayDates: Set<string>,
  nightStart: number | null,
  nightEnd: number | null,
  categoryConfigByCategory: CategoryConfigByCategory,
): SurchargeCategory | null {
  const matches: SurchargeCategory[] = [];
  if (holidayDates.has(localMinute.isoDate)) matches.push('HOLIDAY');
  if (localMinute.weekday === 0 || localMinute.weekday === 6) matches.push('WEEKEND');
  if (
    nightStart !== null &&
    nightEnd !== null &&
    isWithinWindow(localMinute.localMinuteOfDay, nightStart, nightEnd)
  ) {
    matches.push('NIGHT');
  }
  return selectSurchargeCategory(matches, categoryConfigByCategory);
}

function forEachStartedMinute(
  intervals: TimeRuleInterval[],
  formatter: Intl.DateTimeFormat,
  visit: (localMinute: ReturnType<typeof localMinuteInfo>) => void,
): void {
  for (const interval of intervals) {
    const endMs = new Date(interval.end).getTime();
    for (let cursor = new Date(interval.start).getTime(); cursor < endMs; cursor += MINUTE_MS) {
      visit(localMinuteInfo(cursor, formatter));
    }
  }
}

export function recordWorkMinutes(
  intervals: TimeRuleInterval[],
  formatter: Intl.DateTimeFormat,
  daily: Map<string, DailyTotals>,
  holidayDates: Set<string>,
  nightStart: number | null,
  nightEnd: number | null,
  categoryConfigByCategory: CategoryConfigByCategory,
  surchargeBuckets: Map<SurchargeCategory, number>,
): number {
  let totalWorkMinutes = 0;
  forEachStartedMinute(intervals, formatter, (localMinute) => {
    const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };
    day.workMinutes += 1;
    totalWorkMinutes += 1;
    const category = surchargeCategoryForMinute(
      localMinute,
      holidayDates,
      nightStart,
      nightEnd,
      categoryConfigByCategory,
    );
    if (category) surchargeBuckets.set(category, (surchargeBuckets.get(category) ?? 0) + 1);
    daily.set(localMinute.isoDate, day);
  });
  return totalWorkMinutes;
}

export function recordPauseMinutes(
  intervals: TimeRuleInterval[],
  formatter: Intl.DateTimeFormat,
  daily: Map<string, DailyTotals>,
): void {
  forEachStartedMinute(intervals, formatter, (localMinute) => {
    const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };
    day.pauseMinutes += 1;
    daily.set(localMinute.isoDate, day);
  });
}
