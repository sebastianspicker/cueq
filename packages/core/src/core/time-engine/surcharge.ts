/** Maps Europe/Berlin local minutes into mutually exclusive surcharge categories. */
import type { SurchargeCategory } from '@cueq/policy';
import { WORK_INTERVAL_TYPES } from '../constants.js';

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

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayName: string;
}

function formatterPart(parts: ReadonlyMap<string, string>, name: string, fallback: string): string {
  return parts.get(name) ?? fallback;
}

function readLocalDateParts(timestamp: number, formatter: Intl.DateTimeFormat): LocalDateParts {
  const parts = new Map(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(formatterPart(parts, 'year', '1970')),
    month: Number(formatterPart(parts, 'month', '01')),
    day: Number(formatterPart(parts, 'day', '01')),
    hour: Number(formatterPart(parts, 'hour', '0')),
    minute: Number(formatterPart(parts, 'minute', '0')),
    weekdayName: formatterPart(parts, 'weekday', 'Mon'),
  };
}

function normalizeMidnight(parts: LocalDateParts): LocalDateParts {
  if (parts.hour !== 24) return parts;
  return {
    ...parts,
    hour: 0,
  };
}

function weekdayIndex(name: string): number {
  const weekday = WEEKDAY_TO_INDEX[name];
  if (weekday !== undefined) return weekday;
  console.warn(`[cueq] Unknown weekday name "${name}", defaulting to Monday (1)`);
  return 1;
}

/** Parse an `HH:MM` wall-clock value into minutes after midnight, or return null if invalid. */
export function parseLocalTimeToMinute(localTime: string): number | null {
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
    return null;
  }

  return hour * 60 + minute;
}

/** Test a local minute against a window, including windows that cross midnight. */
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

/** Project an instant through the supplied timezone formatter for local-day accounting. */
export function localMinuteInfo(timestamp: number, formatter: Intl.DateTimeFormat): ZonedMinute {
  const parts = normalizeMidnight(readLocalDateParts(timestamp, formatter));
  const isoDate = `${String(parts.year)}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

  return {
    isoDate,
    weekday: weekdayIndex(parts.weekdayName),
    localMinuteOfDay: parts.hour * 60 + parts.minute,
  };
}

/** Identify interval categories that contribute productive work minutes. */
export function isWorkIntervalType(type: string): boolean {
  return WORK_INTERVAL_TYPES.has(type);
}

/** Select one surcharge category by configured priority and a stable fallback tie-break. */
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
