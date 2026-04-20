import type { SurchargeCategory } from '@cueq/policy';
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

export function localMinuteInfo(timestamp: number, formatter: Intl.DateTimeFormat): ZonedMinute {
  const parts = formatter.formatToParts(new Date(timestamp));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  let year = Number(byType.get('year') ?? '1970');
  let month = Number(byType.get('month') ?? '01');
  let day = Number(byType.get('day') ?? '01');
  const weekdayName = byType.get('weekday') ?? 'Mon';
  let hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');

  // Intl.DateTimeFormat with hour12:false can return hour 24 for midnight.
  // Normalize to hour 0 of the next day.
  if (hour === 24) {
    hour = 0;
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
  }

  const weekday = WEEKDAY_TO_INDEX[weekdayName];
  if (weekday === undefined) {
    console.warn(`[cueq] Unknown weekday name "${weekdayName}", defaulting to Monday (1)`);
  }

  const isoDate = `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    isoDate,
    weekday: weekday ?? 1,
    localMinuteOfDay: hour * 60 + minute,
  };
}

export function isWorkIntervalType(type: string): boolean {
  return WORK_INTERVAL_TYPES.has(type);
}

export function selectSurchargeCategory(
  categories: SurchargeCategory[],
  configByCategory: ReadonlyMap<SurchargeCategory, { priority: number }>,
): SurchargeCategory | null {
  if (categories.length === 0) {
    return null;
  }

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
