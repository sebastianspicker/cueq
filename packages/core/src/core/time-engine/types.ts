import type { BreakRule, MaxHoursRule, RestRule, SurchargeRule } from '@cueq/policy';

export interface TimeEnginePolicy {
  breakRule?: BreakRule;
  maxHoursRule?: MaxHoursRule;
  restRule?: RestRule;
  surchargeRule?: SurchargeRule;
}
