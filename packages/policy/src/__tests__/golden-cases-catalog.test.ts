/**
 * Golden-Case Test Suite for @cueq/policy
 *
 * These tests validate the policy rule DEFINITIONS (schemas + defaults).
 * They serve as a CI gate: any change to policy rules must pass these tests.
 *
 * When policy evaluation logic is implemented, golden-case tests will also
 * verify reference calculations against known-good fixtures.
 *
 * To run: pnpm --filter @cueq/policy test:golden
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  getActivePolicyBundle,
  getPolicyHistory,
  POLICY_HISTORY,
  type PolicyCatalogRule,
} from '../index.js';

describe('Golden Cases: Policy Catalog', () => {
  it('POLICY_HISTORY contains exactly 5 default rules', () => {
    expect(POLICY_HISTORY).toHaveLength(5);
  });

  it('getActivePolicyBundle returns all 5 rules for a date within effective range', () => {
    const bundle = getActivePolicyBundle('2026-01-15');
    expect(bundle).toHaveLength(5);
    expect(bundle.map((r) => r.type)).toEqual([
      'BREAK_RULE',
      'LEAVE_RULE',
      'MAX_HOURS_RULE',
      'REST_RULE',
      'SURCHARGE_RULE',
    ]);
  });

  it('getActivePolicyBundle returns rules on exact effectiveFrom date', () => {
    const bundle = getActivePolicyBundle('2024-01-01');
    expect(bundle).toHaveLength(5);
  });

  it('getActivePolicyBundle returns empty/throws for date before all rules', () => {
    // All rules have effectiveFrom: '2024-01-01', so 2023-12-31 should have no active rules
    // The function doesn't explicitly throw when no rules match: it returns an empty array
    // because it only throws per-type when grouped entries exist but latest is null
    const bundle = getActivePolicyBundle('2023-12-31');
    expect(bundle).toHaveLength(0);
  });

  it('getPolicyHistory returns all rules sorted by type when no filter', () => {
    const history = getPolicyHistory();
    expect(history).toHaveLength(5);
    const types = history.map((r) => r.type);
    // Verify alphabetical sort
    expect(types).toEqual([...types].sort());
  });

  it('getPolicyHistory filters by REST_RULE and returns version-descending', () => {
    const history = getPolicyHistory('REST_RULE');
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe('REST_RULE');
    expect(history[0]!.version).toBe(1);
  });

  it('getPolicyHistory returns empty for non-existent type filter', () => {
    // TypeScript wouldn't normally allow this, but at runtime it could happen
    const history = getPolicyHistory('NONEXISTENT_RULE' as any);
    expect(history).toHaveLength(0);
  });

  it('getActivePolicyBundle resolves latest version when multiple versions exist', () => {
    // This test documents the version-conflict resolution behavior:
    // When multiple versions of the same rule type are active on a date,
    // the one with the highest version number wins.
    // Currently POLICY_HISTORY has only v1 rules, so we verify the resolved
    // version is 1 for each rule.
    const bundle = getActivePolicyBundle('2026-01-15');
    for (const rule of bundle) {
      expect(rule.version).toBe(1);
    }
  });

  it('all rules in POLICY_HISTORY have effectiveFrom 2024-01-01 and no effectiveTo', () => {
    for (const rule of POLICY_HISTORY) {
      expect(rule.effectiveFrom).toBe('2024-01-01');
      expect(rule.effectiveTo).toBeNull();
    }
  });

  it('bundle rules are sorted alphabetically by type', () => {
    const bundle = getActivePolicyBundle('2026-01-15');
    const types = bundle.map((r) => r.type);
    expect(types).toEqual([...types].sort());
  });

  it('effectiveTo=null means rules remain active indefinitely (far-future query)', () => {
    // All current rules have effectiveTo=null: they never expire.
    // Querying a far-future date should still return all 5 rules.
    const farFuture = getActivePolicyBundle('2099-12-31');
    expect(farFuture).toHaveLength(5);
  });

  it('getActivePolicyBundle includes rule when asOf equals effectiveTo (inclusive boundary)', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-06-30' }];
    const bundle = getActivePolicyBundle('2025-06-30', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.type).toBe('BREAK_RULE');
  });

  it('getActivePolicyBundle excludes rule when asOf is after effectiveTo', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-06-30' }];
    const bundle = getActivePolicyBundle('2025-07-01', history);
    expect(bundle).toHaveLength(0);
  });

  it('getActivePolicyBundle includes rule when asOf is within effectiveTo range', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-12-31' }];
    const bundle = getActivePolicyBundle('2025-06-15', history);
    expect(bundle).toHaveLength(1);
  });

  it('getActivePolicyBundle resolves version conflicts: latest version wins', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-arbzg-v2', version: 2 },
      { ...DEFAULT_BREAK_RULE, id: 'break-arbzg-v3', version: 3 },
    ];
    const bundle = getActivePolicyBundle('2026-01-15', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.version).toBe(3);
  });

  it('getActivePolicyBundle resolves versions per type independently', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v2', version: 2 },
      { ...DEFAULT_REST_RULE, version: 1 },
      { ...DEFAULT_REST_RULE, id: 'rest-v5', version: 5 },
    ];
    const bundle = getActivePolicyBundle('2026-01-15', history);
    expect(bundle).toHaveLength(2);
    const breakRule = bundle.find((r) => r.type === 'BREAK_RULE')!;
    const restRule = bundle.find((r) => r.type === 'REST_RULE')!;
    expect(breakRule.version).toBe(2);
    expect(restRule.version).toBe(5);
  });

  it('getActivePolicyBundle excludes expired version but includes current one', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1, effectiveTo: '2025-06-30' },
      {
        ...DEFAULT_BREAK_RULE,
        id: 'break-v2',
        version: 2,
        effectiveFrom: '2025-07-01',
        effectiveTo: null,
      },
    ];
    // Query in the v2 era
    const bundle = getActivePolicyBundle('2025-08-01', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.version).toBe(2);
  });

  it('getPolicyHistory returns BREAK_RULE entries sorted by version descending', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v3', version: 3 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v2', version: 2 },
    ];
    const result = getPolicyHistory('BREAK_RULE', history);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.version)).toEqual([3, 2, 1]);
  });

  it('getPolicyHistory filters correctly across mixed types', () => {
    const history: PolicyCatalogRule[] = [
      DEFAULT_BREAK_RULE,
      DEFAULT_REST_RULE,
      DEFAULT_MAX_HOURS_RULE,
    ];
    const breakOnly = getPolicyHistory('BREAK_RULE', history);
    expect(breakOnly).toHaveLength(1);
    expect(breakOnly[0]!.type).toBe('BREAK_RULE');
  });

  it('getPolicyHistory without filter returns all entries sorted by type', () => {
    const history: PolicyCatalogRule[] = [
      DEFAULT_REST_RULE,
      DEFAULT_BREAK_RULE,
      DEFAULT_MAX_HOURS_RULE,
    ];
    const all = getPolicyHistory(undefined, history);
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.type)).toEqual(['BREAK_RULE', 'MAX_HOURS_RULE', 'REST_RULE']);
  });
});
