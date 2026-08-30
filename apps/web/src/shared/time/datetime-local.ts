/** Converts between API instants and Europe/Berlin datetime-local values, including DST edge cases. */
const BERLIN_TIME_ZONE = 'Europe/Berlin';
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;
const berlinFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BERLIN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function requiredPart(parts: ReadonlyMap<string, number>, name: string): number {
  const value = parts.get(name);
  if (value === undefined || !Number.isFinite(value)) {
    throw new RangeError(`Intl.DateTimeFormat did not provide a valid ${name} part.`);
  }
  return value;
}

function berlinParts(value: Date): DateTimeParts {
  const parts = new Map(
    berlinFormatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: requiredPart(parts, 'year'),
    month: requiredPart(parts, 'month'),
    day: requiredPart(parts, 'day'),
    hour: requiredPart(parts, 'hour'),
    minute: requiredPart(parts, 'minute'),
    second: requiredPart(parts, 'second'),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function asLocalInput(parts: DateTimeParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function berlinOffsetAt(timestamp: number): number {
  const parts = berlinParts(new Date(timestamp));
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    timestamp
  );
}

export function isoInstantToLocalDateTimeInput(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return '';
  }
  return asLocalInput(berlinParts(instant));
}

/**
 * Convert a Europe/Berlin wall-clock value to an ISO instant.
 *
 * Nonexistent spring-forward values are rejected. Ambiguous fall-back values
 * resolve to the earlier instant, matching the usual "compatible" behavior.
 */
export function localDateTimeInputToIsoInstant(value: string): string | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const target = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: 0,
  };
  if (
    target.month < 1 ||
    target.month > 12 ||
    target.day < 1 ||
    target.day > 31 ||
    target.hour > 23 ||
    target.minute > 59
  ) {
    return null;
  }

  const wallClockAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const candidateOffsets = new Set(
    [-86_400_000, -21_600_000, 0, 21_600_000, 86_400_000].map((delta) =>
      berlinOffsetAt(wallClockAsUtc + delta),
    ),
  );
  const matchingInstants = [...candidateOffsets]
    .map((offset) => new Date(wallClockAsUtc - offset))
    .filter((candidate) => asLocalInput(berlinParts(candidate)) === value)
    .sort((left, right) => left.getTime() - right.getTime());

  return matchingInstants[0]?.toISOString() ?? null;
}
