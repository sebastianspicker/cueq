import { describe, expect, it } from 'vitest';
import {
  canManageClosingPeriod,
  createClosingActionDescriptors,
  hasHrClosingAuthority,
} from './closing-action-policy';

const reviewPeriod = {
  id: 'period-1',
  organizationUnitId: null,
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  status: 'REVIEW',
  exportRuns: [],
};

describe('closing action policy', () => {
  it('exposes only lead approval to a team lead while the period awaits approval', () => {
    const [leadApproval] = createClosingActionDescriptors({
      role: 'TEAM_LEAD',
      period: reviewPeriod,
      checklist: null,
      exportFormat: 'CSV_V1',
      workflowReason: 'Correction requested',
    });

    expect(leadApproval).toMatchObject({ id: 'lead-approve', available: true });
  });

  it('requires lead approval and an error-free checklist before HR approval', () => {
    const actions = createClosingActionDescriptors({
      role: 'HR',
      period: reviewPeriod,
      checklist: { closingPeriodId: 'period-1', status: 'READY', hasErrors: true, items: [] },
      exportFormat: 'XML_V1',
      workflowReason: 'Correction requested',
    });

    expect(actions.find((action) => action.id === 'approve')).toMatchObject({ available: false });
    expect(actions.find((action) => action.id === 'reopen')).toMatchObject({ available: true });
  });

  it('keeps action visibility aligned with the API roles', () => {
    expect(canManageClosingPeriod('EMPLOYEE')).toBe(false);
    expect(hasHrClosingAuthority('TEAM_LEAD')).toBe(false);
    expect(hasHrClosingAuthority('ADMIN')).toBe(true);
  });
});
