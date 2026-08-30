/** Construct normalized rule violations with the domain default severity. */
import type { RuleViolation } from '../types.js';

/** Apply the default error severity while preserving an explicitly supplied severity. */
export function toViolation(
  partial: Omit<RuleViolation, 'severity'> & { severity?: RuleViolation['severity'] },
): RuleViolation {
  return {
    severity: partial.severity ?? 'ERROR',
    ...partial,
  };
}
