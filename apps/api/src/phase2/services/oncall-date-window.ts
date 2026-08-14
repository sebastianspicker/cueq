import { BadRequestException } from '@nestjs/common';

export type OnCallDateWindowQuery = {
  from?: string;
  to?: string;
};

export type OnCallDateWindowWhere = {
  AND?: Array<{ startTime?: { lte: Date }; endTime?: { gte: Date } }>;
  startTime?: { lte: Date };
  endTime?: { gte: Date };
};

/** Builds the inclusive overlap predicate shared by on-call rotation and deployment reads. */
export function onCallDateWindowWhere(query: OnCallDateWindowQuery): OnCallDateWindowWhere {
  const fromDate = query.from ? new Date(query.from) : null;
  const toDate = query.to ? new Date(query.to) : null;
  if (fromDate && toDate && fromDate > toDate) {
    throw new BadRequestException('from must be on or before to.');
  }
  if (fromDate && toDate) {
    return { AND: [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }] };
  }
  if (fromDate) {
    return { endTime: { gte: fromDate } };
  }
  if (toDate) {
    return { startTime: { lte: toDate } };
  }
  return {};
}
