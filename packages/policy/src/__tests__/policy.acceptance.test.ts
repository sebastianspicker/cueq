import { describe, expect, it } from 'vitest';
import { DEFAULT_REST_RULE } from '../rules/rest-rules';

describe('@cueq/policy acceptance', () => {
  it('defines rest reduction settings for on-call scenarios', () => {
    expect(DEFAULT_REST_RULE.onCallRestReduction?.enabled).toBe(true);
    expect(DEFAULT_REST_RULE.onCallRestReduction?.minRestHoursAfterDeployment).toBe(11);
  });
});
