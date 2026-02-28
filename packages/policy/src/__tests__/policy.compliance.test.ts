import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAVE_RULE } from '../rules/leave-rules';

describe('@cueq/policy compliance', () => {
  it('keeps TV-L annual entitlement baseline at 30 days', () => {
    expect(DEFAULT_LEAVE_RULE.annualEntitlementDays).toBe(30);
  });
});
