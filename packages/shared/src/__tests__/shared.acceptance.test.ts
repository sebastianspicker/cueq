import { describe, expect, it } from 'vitest';
import { WorkflowDecisionSchema } from '../schemas/workflow';

describe('@cueq/shared acceptance', () => {
  it('accepts valid workflow decision payloads', () => {
    const payload = {
      workflowId: 'c00000000000000000000001',
      decision: 'APPROVED',
    };

    expect(WorkflowDecisionSchema.parse(payload).decision).toBe('APPROVED');
  });

  it('rejects contradictory workflow action and decision payloads', () => {
    expect(() =>
      WorkflowDecisionSchema.parse({
        workflowId: 'c00000000000000000000001',
        action: 'APPROVE',
        decision: 'APPROVED',
      }),
    ).toThrow('action and decision cannot be provided together');
  });
});
