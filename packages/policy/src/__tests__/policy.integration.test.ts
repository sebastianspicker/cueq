import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_RULE } from '../rules/break-rules';

describe('@cueq/policy integration', () => {
  it('keeps break-rule thresholds ordered by worked-hours minimum', () => {
    const thresholds = DEFAULT_BREAK_RULE.thresholds;
    expect(thresholds[0]?.workedHoursMin).toBeLessThan(thresholds[1]?.workedHoursMin ?? 0);
  });
});
