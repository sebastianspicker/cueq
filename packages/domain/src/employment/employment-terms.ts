import { parseIsoDateTime } from '../calendar/date-parsing.js';

export type EmploymentTermsErrorCode =
  | 'NO_EFFECTIVE_TERM'
  | 'AMBIGUOUS_TERMS'
  | 'INCOMPATIBLE_TERMS'
  | 'INVALID_INTERVAL';

/** A deterministic employment-term resolution failure suitable for API mapping. */
export class EmploymentTermsError extends Error {
  readonly code: EmploymentTermsErrorCode;

  constructor(code: EmploymentTermsErrorCode, message: string) {
    super(message);
    this.name = 'EmploymentTermsError';
    this.code = code;
  }
}

export interface EffectiveEmploymentTerm {
  id: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

interface NormalizedTerm<T extends EffectiveEmploymentTerm> {
  term: T;
  from: number;
  to: number;
}

function invalidInterval(message: string): never {
  throw new EmploymentTermsError('INVALID_INTERVAL', message);
}

function parseInstant(value: string, label: string): number {
  try {
    return parseIsoDateTime(value).getTime();
  } catch {
    return invalidInterval(`${label} must be a valid ISO datetime.`);
  }
}

function normalizeTerms<T extends EffectiveEmploymentTerm>(terms: T[]): NormalizedTerm<T>[] {
  return terms
    .map((term) => {
      const from =
        term.effectiveFrom === null
          ? Number.NEGATIVE_INFINITY
          : parseInstant(term.effectiveFrom, `Term ${term.id} effectiveFrom`);
      const to =
        term.effectiveTo === null
          ? Number.POSITIVE_INFINITY
          : parseInstant(term.effectiveTo, `Term ${term.id} effectiveTo`);

      if (from >= to) {
        return invalidInterval(`Term ${term.id} must end after it starts.`);
      }

      return { term, from, to };
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function noEffectiveTerm(at: number): never {
  throw new EmploymentTermsError(
    'NO_EFFECTIVE_TERM',
    `No employment term is effective at ${new Date(at).toISOString()}.`,
  );
}

function ambiguousTerms(): never {
  throw new EmploymentTermsError(
    'AMBIGUOUS_TERMS',
    'Multiple employment terms are effective during the requested interval.',
  );
}

function resolvePoint<T extends EffectiveEmploymentTerm>(
  terms: NormalizedTerm<T>[],
  requestedFrom: number,
): T[] {
  const effective = terms.filter((term) => term.from <= requestedFrom && requestedFrom < term.to);
  if (effective.length === 0) {
    return noEffectiveTerm(requestedFrom);
  }
  if (effective.length > 1) {
    return ambiguousTerms();
  }
  const selected = effective[0];
  if (selected === undefined) {
    return noEffectiveTerm(requestedFrom);
  }
  return [selected.term];
}

/**
 * Resolve the ordered terms covering a half-open interval.
 *
 * Null effective bounds represent unknown legacy bounds and are treated as
 * unbounded. Omitting `to` performs a point lookup at `from`, which supports
 * validation when an open booking has no end instant yet.
 */
export function resolveEmploymentTermsForInterval<T extends EffectiveEmploymentTerm>(
  terms: T[],
  from: string,
  to: string | undefined,
  compatible: (left: T, right: T) => boolean,
): T[] {
  const requestedFrom = parseInstant(from, 'Interval start');
  const requestedTo = to === undefined ? undefined : parseInstant(to, 'Interval end');

  if (requestedTo !== undefined && requestedFrom >= requestedTo) {
    return invalidInterval('Interval end must be after its start.');
  }

  const normalized = normalizeTerms(terms);

  if (requestedTo === undefined) {
    return resolvePoint(normalized, requestedFrom);
  }

  const relevant = normalized.filter((term) => term.from < requestedTo && requestedFrom < term.to);

  let furthestEnd = Number.NEGATIVE_INFINITY;
  for (const term of relevant) {
    if (term.from < furthestEnd) {
      return ambiguousTerms();
    }
    furthestEnd = Math.max(furthestEnd, term.to);
  }

  const firstIndex = relevant.findIndex(
    (term) => term.from <= requestedFrom && requestedFrom < term.to,
  );
  if (firstIndex === -1) {
    return noEffectiveTerm(requestedFrom);
  }

  const first = relevant[firstIndex];
  if (first === undefined) {
    return noEffectiveTerm(requestedFrom);
  }
  const resolved: T[] = [first.term];
  let current = first;
  let nextIndex = firstIndex + 1;

  while (current.to < requestedTo) {
    const next = relevant[nextIndex];
    if (next === undefined || next.from !== current.to) {
      return noEffectiveTerm(current.to);
    }
    if (!compatible(current.term, next.term)) {
      throw new EmploymentTermsError(
        'INCOMPATIBLE_TERMS',
        `Employment terms ${current.term.id} and ${next.term.id} are incompatible.`,
      );
    }
    resolved.push(next.term);
    current = next;
    nextIndex += 1;
  }

  return resolved;
}
