/** Evaluates whether on-call deployments preserve the configured minimum rest period. */
import { DEFAULT_REST_RULE } from '@cueq/policy';
import type { RestRule } from '@cueq/policy';
import type { CoreOnCallRestContract } from '@cueq/shared';
import type { RuleViolation } from '../types.js';
import { compareIsoInstants, diffHours, roundToTwo, toViolation } from '../utils.js';

export interface OnCallDeployment {
  start: string;
  end: string;
}

export type OnCallRestInput = CoreOnCallRestContract['input'] & {
  personCode?: string;
  deployments: OnCallDeployment[];
};

export type OnCallRestResult = Omit<CoreOnCallRestContract['output'], 'violations'> & {
  violations: RuleViolation[];
};

/** Compare the latest deployment end with the next shift under any allowed on-call reduction. */
export function evaluateOnCallRestCompliance(
  input: OnCallRestInput,
  policy: { restRule?: RestRule } = {},
): OnCallRestResult {
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;
  const minimumRestHours =
    restRule.onCallRestReduction?.enabled &&
    restRule.onCallRestReduction.minRestHoursAfterDeployment
      ? restRule.onCallRestReduction.minRestHoursAfterDeployment
      : restRule.minRestHours;

  const lastDeployment = [...input.deployments].sort((left, right) =>
    compareIsoInstants(right.end, left.end),
  )[0];

  if (!lastDeployment) {
    return {
      restHoursAfterDeployment: 0,
      minimumRestHours,
      compliant: true,
      violations: [],
    };
  }

  const restHoursAfterDeployment = roundToTwo(diffHours(lastDeployment.end, input.nextShiftStart));
  const compliant = restHoursAfterDeployment >= minimumRestHours;

  const violations = compliant
    ? []
    : [
        toViolation({
          code: 'ONCALL_REST_DEFICIT',
          message: `Rest after deployment is ${restHoursAfterDeployment}h and below required ${minimumRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
          context: {
            deploymentEnd: lastDeployment.end,
            nextShiftStart: input.nextShiftStart,
          },
        }),
      ];

  return {
    restHoursAfterDeployment,
    minimumRestHours,
    compliant,
    violations,
  };
}
