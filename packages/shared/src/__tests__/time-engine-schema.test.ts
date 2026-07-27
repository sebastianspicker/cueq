import { describe, expect, it } from 'vitest';
import {
  ProratedTargetRequestSchema,
  TimeRuleEvaluationRequestSchema,
} from '../schemas/time-engine.js';

const interval = {
  start: '2026-03-03T08:00:00.000Z',
  end: '2026-03-03T09:00:00.000Z',
  type: 'WORK' as const,
};

describe('time-engine request schemas', () => {
  it('rejects invalid timezones at the HTTP validation boundary', () => {
    const base = { week: '2026-W10', targetHours: 1, intervals: [interval] };

    expect(
      TimeRuleEvaluationRequestSchema.safeParse({ ...base, timezone: 'Europe/Berlin' }).success,
    ).toBe(true);
    expect(
      TimeRuleEvaluationRequestSchema.safeParse({ ...base, timezone: 'Europe/Not-A-Zone' }).success,
    ).toBe(false);
  });

  it('accepts only real, zero-padded calendar months', () => {
    const base = {
      actualHours: 1,
      segments: [{ from: '2026-01-01', to: '2026-01-31', weeklyHours: 39.83 }],
    };

    expect(ProratedTargetRequestSchema.safeParse({ ...base, month: '2026-12' }).success).toBe(true);
    for (const month of ['2026-00', '2026-13', '2026-1']) {
      expect(ProratedTargetRequestSchema.safeParse({ ...base, month }).success).toBe(false);
    }
  });
});
