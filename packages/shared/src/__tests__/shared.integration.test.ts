import { describe, expect, it } from 'vitest';
import { CreateBookingSchema } from '../schemas/booking';
import { TimeRuleEvaluationRequestSchema } from '../schemas/time-engine';

describe('@cueq/shared integration', () => {
  it('validates create booking payloads', () => {
    const payload = {
      personId: 'c00000000000000000000001',
      timeTypeId: 'c00000000000000000000002',
      startTime: '2026-03-02T08:00:00.000Z',
      source: 'WEB',
    };

    expect(CreateBookingSchema.parse(payload)).toMatchObject(payload);
  });

  it('validates time-rule evaluation payloads', () => {
    const payload = {
      week: '2026-W10',
      targetHours: 39.83,
      timezone: 'Europe/Berlin',
      holidayDates: ['2026-04-05'],
      intervals: [
        {
          start: '2026-03-03T07:00:00.000Z',
          end: '2026-03-03T15:00:00.000Z',
          type: 'WORK',
        },
      ],
    };

    expect(TimeRuleEvaluationRequestSchema.parse(payload)).toMatchObject(payload);
  });
});
