import { Injectable } from '@nestjs/common';
import {
  getActivePolicyBundle,
  getPolicyHistory,
  type PolicyCatalogRule,
  type PolicyRuleType,
} from '@cueq/policy';
import {
  PolicyBundleQuerySchema,
  PolicyHistoryQuerySchema,
} from '@cueq/shared';

function toPolicyDto(entry: PolicyCatalogRule) {
  const { type, id, name, description, version, effectiveFrom, effectiveTo, createdAt, createdBy, ...payload } = entry;
  return { type, id, name, description, version, effectiveFrom, effectiveTo, createdAt, createdBy, payload };
}

@Injectable()
export class PolicyQueryService {
  async policyBundle(query: unknown) {
    const parsed = PolicyBundleQuerySchema.parse(query ?? {});
    const asOf = parsed.asOf ?? new Date().toISOString().slice(0, 10);
    const policies = getActivePolicyBundle(asOf).map(toPolicyDto);

    return {
      asOf,
      policies,
    };
  }

  async policyHistory(query: unknown) {
    const parsed = PolicyHistoryQuerySchema.parse(query ?? {});
    const entries = getPolicyHistory(parsed.type as PolicyRuleType | undefined).map(toPolicyDto);

    return {
      total: entries.length,
      entries,
    };
  }
}
