/** Internal contracts shared by time-engine classification, accounting, and outcome stages. */
import type { BreakRule, MaxHoursRule, RestRule, SurchargeRule } from '@cueq/policy';
import type { CoreTimeRuleEvaluationContract } from '../generated/schema-contracts.js';
import type { DomainWarning, RuleViolation } from '../types.js';

export interface TimeEnginePolicy {
  breakRule?: BreakRule;
  maxHoursRule?: MaxHoursRule;
  restRule?: RestRule;
  surchargeRule?: SurchargeRule;
}

export type TimeRuleInterval = CoreTimeRuleEvaluationContract['input']['intervals'][number];

export type TimeRuleEvaluationInput = CoreTimeRuleEvaluationContract['input'] & {
  personCode?: string;
};

export type TimeRuleEvaluationResult = Omit<
  CoreTimeRuleEvaluationContract['output'],
  'violations' | 'warnings'
> & {
  violations: RuleViolation[];
  warnings: DomainWarning[];
};
