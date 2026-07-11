import type { BreakRule, MaxHoursRule, RestRule, SurchargeRule } from '@cueq/policy';
import type { CoreTimeRuleEvaluationContract } from '@cueq/shared';
import type { DomainWarning, RuleViolation } from '../types';

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
