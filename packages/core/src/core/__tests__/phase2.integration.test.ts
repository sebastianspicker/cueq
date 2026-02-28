import { describe, expect, it } from 'vitest';
import { calculateProratedMonthlyTarget } from '../absence';

describe('@cueq/core integration', () => {
  it('computes deterministic prorated targets for part-time changes', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      actualHours: 149,
      transitionAdjustmentHours: -0.33,
      segments: [
        { from: '2026-04-01', to: '2026-04-14', weeklyHours: 39.83 },
        { from: '2026-04-15', to: '2026-04-30', weeklyHours: 30 },
      ],
    });

    expect(result.proratedTargetHours).toBe(151.33);
    expect(result.deltaHours).toBe(-2.33);
  });
});
