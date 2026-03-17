import { parseDateOnlyToTimestamp } from '@cueq/shared';
import { DEFAULT_BREAK_RULE, type BreakRule } from './rules/break-rules';
import { DEFAULT_LEAVE_RULE, type LeaveRule } from './rules/leave-rules';
import { DEFAULT_MAX_HOURS_RULE, type MaxHoursRule } from './rules/max-hours-rules';
import { DEFAULT_REST_RULE, type RestRule } from './rules/rest-rules';
import { DEFAULT_SURCHARGE_RULE, type SurchargeRule } from './rules/surcharge-rules';

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

export function getPolicyHistory(type?: PolicyRuleType): PolicyCatalogRule[] {
  if (!type) {
    return [...POLICY_HISTORY].sort((a, b) => a.type.localeCompare(b.type));
  }

  return POLICY_HISTORY.filter((entry) => entry.type === type).sort(
    (a, b) => b.version - a.version,
  );
}

export function getActivePolicyBundle(asOf: string): PolicyCatalogRule[] {
  const grouped = new Map<PolicyRuleType, PolicyCatalogRule[]>();

  for (const entry of POLICY_HISTORY) {
    if (!inRange(asOf, entry.effectiveFrom, entry.effectiveTo)) {
      continue;
    }

    const type = entry.type as PolicyRuleType;
    if (!grouped.has(type)) {
      grouped.set(type, []);
    }

    grouped.get(type)!.push(entry);
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
