/** Resolves effective-dated policy bundles while retaining history for audit and replay. */
import { parseDateOnlyToTimestamp } from '@cueq/shared';
import { DEFAULT_BREAK_RULE, type BreakRule } from './rules/break-rules.js';
import { DEFAULT_LEAVE_RULE, type LeaveRule } from './rules/leave-rules.js';
import { DEFAULT_MAX_HOURS_RULE, type MaxHoursRule } from './rules/max-hours-rules.js';
import { DEFAULT_REST_RULE, type RestRule } from './rules/rest-rules.js';
import { DEFAULT_SURCHARGE_RULE, type SurchargeRule } from './rules/surcharge-rules.js';

export type PolicyRuleType =
  | 'BREAK_RULE'
  | 'REST_RULE'
  | 'MAX_HOURS_RULE'
  | 'LEAVE_RULE'
  | 'SURCHARGE_RULE';

export type PolicyCatalogRule = BreakRule | RestRule | MaxHoursRule | LeaveRule | SurchargeRule;

function inRange(asOf: string, effectiveFrom: string, effectiveTo: string | null): boolean {
  const asOfTs = parseDateOnlyToTimestamp(asOf);
  const fromTs = parseDateOnlyToTimestamp(effectiveFrom);
  if (asOfTs < fromTs) {
    return false;
  }

  if (!effectiveTo) {
    return true;
  }

  return asOfTs <= parseDateOnlyToTimestamp(effectiveTo);
}

export const POLICY_HISTORY: ReadonlyArray<PolicyCatalogRule> = Object.freeze([
  DEFAULT_BREAK_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_LEAVE_RULE,
  DEFAULT_SURCHARGE_RULE,
]);

/** Return stable version-descending history, optionally restricted to one rule type. */
export function getPolicyHistory(
  type?: PolicyRuleType,
  history: ReadonlyArray<PolicyCatalogRule> = POLICY_HISTORY,
): PolicyCatalogRule[] {
  if (!type) {
    return [...history].sort((a, b) => a.type.localeCompare(b.type));
  }

  return history.filter((entry) => entry.type === type).sort((a, b) => b.version - a.version);
}

/** Resolve the highest active version of each rule type for a specific date. */
export function getActivePolicyBundle(
  asOf: string,
  history: ReadonlyArray<PolicyCatalogRule> = POLICY_HISTORY,
): PolicyCatalogRule[] {
  const grouped = new Map<PolicyRuleType, PolicyCatalogRule[]>();

  for (const entry of history) {
    if (!inRange(asOf, entry.effectiveFrom, entry.effectiveTo)) {
      continue;
    }

    const type = entry.type as PolicyRuleType;
    const entries = grouped.get(type) ?? [];
    entries.push(entry);
    grouped.set(type, entries);
  }

  const resolved: PolicyCatalogRule[] = [];
  for (const [type, entries] of grouped.entries()) {
    const latest = [...entries].sort((a, b) => b.version - a.version)[0];
    if (!latest) {
      throw new Error(`No active policy found for ${type} on ${asOf}`);
    }

    resolved.push(latest);
  }

  return resolved.sort((a, b) => a.type.localeCompare(b.type));
}
