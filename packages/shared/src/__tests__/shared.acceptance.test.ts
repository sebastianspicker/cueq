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
});
