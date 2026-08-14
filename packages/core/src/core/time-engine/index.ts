/** Public time-engine compatibility surface. */
export { evaluateTimeRules } from './evaluate-time-rules.js';
export type {
  TimeEnginePolicy,
  TimeRuleEvaluationInput,
  TimeRuleEvaluationResult,
  TimeRuleInterval,
} from './types.js';
export type { PlausibilityInterval } from './plausibility.js';
export { evaluatePlausibility } from './plausibility.js';
export type { FlextimeWeekBooking, FlextimeWeekInput, FlextimeWeekResult } from './flextime.js';
export { calculateFlextimeWeek } from './flextime.js';
export type { OnCallDeployment, OnCallRestInput, OnCallRestResult } from './oncall-rest.js';
export { evaluateOnCallRestCompliance } from './oncall-rest.js';
