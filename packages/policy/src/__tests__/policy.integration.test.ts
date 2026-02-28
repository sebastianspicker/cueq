import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_RULE } from '../rules/break-rules';
import { getActivePolicyBundle, getPolicyHistory } from '../catalog';

describe('@cueq/policy integration', () => {
  it('keeps break-rule thresholds ordered by worked-hours minimum', () => {
    const thresholds = DEFAULT_BREAK_RULE.thresholds;
    expect(thresholds[0]?.workedHoursMin).toBeLessThan(thresholds[1]?.workedHoursMin ?? 0);
  });

  it('resolves active policy bundle by as-of date', () => {
    const bundle = getActivePolicyBundle('2026-03-15');
    expect(bundle).toHaveLength(4);
    expect(bundle.map((entry) => entry.type)).toEqual([
      'BREAK_RULE',
      'LEAVE_RULE',
      'MAX_HOURS_RULE',
      'REST_RULE',
    ]);
  });

  it('filters policy history by rule type', () => {
    const history = getPolicyHistory('REST_RULE');
    expect(history).toHaveLength(1);
    expect(history[0]?.type).toBe('REST_RULE');
  });
});
