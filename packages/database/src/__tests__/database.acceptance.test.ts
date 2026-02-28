import { describe, expect, it } from 'vitest';
import { prisma } from '../index';

describe('@cueq/database acceptance', () => {
  it('exposes phase-2 persistence delegates', () => {
    expect(prisma.person).toBeDefined();
    expect(prisma.booking).toBeDefined();
    expect(prisma.workflowInstance).toBeDefined();
    expect(prisma.closingPeriod).toBeDefined();
    expect(prisma.onCallDeployment).toBeDefined();
    expect(prisma.terminalSyncBatch).toBeDefined();
  });
});
