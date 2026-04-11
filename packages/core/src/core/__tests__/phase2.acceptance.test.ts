import { describe, expect, it } from 'vitest';
import { evaluateOnCallRestCompliance } from '../time-engine';

describe('@cueq/core acceptance', () => {
  it('evaluates on-call rest compliance for AT-05 baseline fixture', () => {
    const result = evaluateOnCallRestCompliance({
      rotationStart: '2026-03-12T16:00:00Z',
      rotationEnd: '2026-03-19T08:00:00Z',
      nextShiftStart: '2026-03-14T14:00:00Z',
      deployments: [{ start: '2026-03-14T01:10:00Z', end: '2026-03-14T02:20:00Z' }],
    });

    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.minimumRestHours).toBe(11);
  });
});
