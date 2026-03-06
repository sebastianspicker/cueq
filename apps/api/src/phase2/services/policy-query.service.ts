import { Injectable } from '@nestjs/common';
import {
  getActivePolicyBundle,
  getPolicyHistory,
  type PolicyRuleType,
} from '@cueq/policy';
import {
  PolicyBundleQuerySchema,
  PolicyHistoryQuerySchema,
} from '@cueq/shared';

@Injectable()
export class PolicyQueryService {
  async policyBundle(query: unknown) {
    const parsed = PolicyBundleQuerySchema.parse(query ?? {});
    const asOf = parsed.asOf ?? new Date().toISOString().slice(0, 10);
    const policies = getActivePolicyBundle(asOf).map((entry) => {
      const {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        ...payload
      } = entry;
      return {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        payload,
      };
    });

    return {
      asOf,
      policies,
    };
  }

  async policyHistory(query: unknown) {
    const parsed = PolicyHistoryQuerySchema.parse(query ?? {});
    const entries = getPolicyHistory(parsed.type as PolicyRuleType | undefined).map((entry) => {
      const {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        ...payload
      } = entry;
      return {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        payload,
      };
    });

    return {
      total: entries.length,
      entries,
    };
  }
}
