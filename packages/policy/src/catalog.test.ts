import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_RULE,
  DEFAULT_LEAVE_RULE,
  getActivePolicyBundle,
  getPolicyHistory,
  type BreakRule,
  type PolicyCatalogRule,
} from './index.js';

const breakRuleV1: BreakRule = {
  ...DEFAULT_BREAK_RULE,
  id: 'break-arbzg-v1',
  effectiveFrom: '2024-01-01',
  effectiveTo: '2025-12-31',
};

const breakRuleV2: BreakRule = {
  ...DEFAULT_BREAK_RULE,
  id: 'break-arbzg-v2',
  version: 2,
  effectiveFrom: '2026-01-01',
};

describe('policy catalog', () => {
  it('returns a stable, non-mutating version history', () => {
    const history: PolicyCatalogRule[] = [DEFAULT_LEAVE_RULE, breakRuleV1, breakRuleV2];

    expect(getPolicyHistory(undefined, history).map((entry) => entry.type)).toEqual([
      'BREAK_RULE',
      'BREAK_RULE',
      'LEAVE_RULE',
    ]);
    expect(getPolicyHistory('BREAK_RULE', history).map((entry) => entry.version)).toEqual([2, 1]);
    expect(history.map((entry) => entry.id)).toEqual([
      'leave-tvl-default',
      'break-arbzg-v1',
      'break-arbzg-v2',
    ]);
  });

  it('resolves the highest effective version and includes the effective end date', () => {
    const history: PolicyCatalogRule[] = [DEFAULT_LEAVE_RULE, breakRuleV1, breakRuleV2];

    expect(getActivePolicyBundle('2025-12-31', history)).toMatchObject([
      { type: 'BREAK_RULE', id: 'break-arbzg-v1', version: 1 },
      { type: 'LEAVE_RULE', id: 'leave-tvl-default', version: 1 },
    ]);
    expect(getActivePolicyBundle('2026-01-01', history)).toMatchObject([
      { type: 'BREAK_RULE', id: 'break-arbzg-v2', version: 2 },
      { type: 'LEAVE_RULE', id: 'leave-tvl-default', version: 1 },
    ]);
    expect(getActivePolicyBundle('2023-12-31', history)).toEqual([]);
  });

  it('rejects malformed and impossible effective dates', () => {
    expect(() => getActivePolicyBundle('2026/01/01')).toThrow('Invalid date: 2026/01/01');
    expect(() => getActivePolicyBundle('2026-02-30')).toThrow('Invalid date: 2026-02-30');
  });
});
