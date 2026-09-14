import { SplitTimeAccountSchema, type TimeAccount } from '@cueq/contracts';
import { localDateTimeInputToIsoInstant } from '../../../shared/time/datetime-local';

export const segmentFields = [
  'periodStart',
  'periodEnd',
  'targetHours',
  'actualHours',
  'balance',
  'overtimeHours',
] as const;
export type AccountSegmentDraft = Record<(typeof segmentFields)[number], string>;
export function emptyAccountSegment(): AccountSegmentDraft {
  return {
    periodStart: '',
    periodEnd: '',
    targetHours: '',
    actualHours: '',
    balance: '',
    overtimeHours: '',
  };
}
export function splitAccountPayload(
  account: Pick<TimeAccount, 'updatedAt'>,
  reason: string,
  segments: AccountSegmentDraft[],
) {
  if (segments.some((segment) => segmentFields.some((key) => segment[key].trim() === '')))
    throw new Error('Missing segment value');
  return SplitTimeAccountSchema.parse({
    expectedUpdatedAt: account.updatedAt,
    reason,
    segments: segments.map((segment) => ({
      periodStart: localDateTimeInputToIsoInstant(segment.periodStart),
      periodEnd: localDateTimeInputToIsoInstant(segment.periodEnd),
      targetHours: Number(segment.targetHours),
      actualHours: Number(segment.actualHours),
      balance: Number(segment.balance),
      overtimeHours: Number(segment.overtimeHours),
    })),
  });
}
