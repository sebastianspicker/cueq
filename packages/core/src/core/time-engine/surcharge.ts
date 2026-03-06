import type { SurchargeCategory, SurchargeRule } from '@cueq/policy';
import { WORK_INTERVAL_TYPES } from '../constants';

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const SURCHARGE_TIE_BREAK: Record<SurchargeCategory, number> = {
  HOLIDAY: 3,
  WEEKEND: 2,
  NIGHT: 1,
};

export interface ZonedMinute {
  isoDate: string;
  weekday: number;
  localMinuteOfDay: number;
}

export function parseLocalTimeToMinute(localTime: string): number {
  const [hourRaw, minuteRaw] = localTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }

  return hour * 60 + minute;
}

export function isWithinWindow(
  localMinuteOfDay: number,
  startMinute: number,
  endMinute: number,
): boolean {
  if (startMinute === endMinute) {
    return true;
  }

  if (startMinute < endMinute) {
    return localMinuteOfDay >= startMinute && localMinuteOfDay < endMinute;
  }

  return localMinuteOfDay >= startMinute || localMinuteOfDay < endMinute;
}

export function localMinuteInfo(
  timestamp: number,
  formatter: Intl.DateTimeFormat,
): ZonedMinute {
  const parts = formatter.formatToParts(new Date(timestamp));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '1970';
  const month = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const weekdayName = byType.get('weekday') ?? 'Mon';
  const hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');

  const weekday = WEEKDAY_TO_INDEX[weekdayName];
  if (weekday === undefined) {
    console.warn(`[cueq] Unknown weekday name "${weekdayName}", defaulting to Monday (1)`);
  }

  return {
    isoDate: `${year}-${month}-${day}`,
    weekday: weekday ?? 1,
    localMinuteOfDay: hour * 60 + minute,
  };
}

export function isWorkIntervalType(type: string): boolean {
  return WORK_INTERVAL_TYPES.has(type);
}

export function selectSurchargeCategory(
  categories: SurchargeCategory[],
  surchargeRule: SurchargeRule,
): SurchargeCategory | null {
  if (categories.length === 0) {
    return null;
  }

  const configByCategory = new Map(
    surchargeRule.categories.map((entry) => [entry.category, entry]),
  );

  return (
    [...categories].sort((left, right) => {
      const leftPriority = configByCategory.get(left)?.priority ?? 0;
      const rightPriority = configByCategory.get(right)?.priority ?? 0;
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return SURCHARGE_TIE_BREAK[right] - SURCHARGE_TIE_BREAK[left];
    })[0] ?? null
  );
}
