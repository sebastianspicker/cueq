import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ReportingService } from './reporting.service.js';

const ORGANIZATION_UNIT_ID = 'c000000000000000000000001';
const user = (role: Role) => ({
  subject: 'subject',
  email: 'reporter@cueq.local',
  role,
  claims: {},
});

function serviceWith(analytics: Record<string, unknown>) {
  return new ReportingService({} as never, analytics as never);
}

describe('ReportingService custom reports', () => {
  it('returns the stable custom-report option inventory for authorized roles', () => {
    const service = serviceWith({});

    expect(service.reportCustomOptions(user(Role.HR))).toEqual({
      reportTypes: ['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION'],
      groupBy: ['ORGANIZATION_UNIT', 'NONE'],
      metrics: ['requests', 'days', 'people', 'totalOvertimeHours', 'completionRate', 'exported'],
    });
  });

  it('rejects unauthorized users before custom preview parsing or report dispatch', async () => {
    const reportTeamAbsence = vi.fn();
    const service = serviceWith({ reportTeamAbsence });

    await expect(service.reportCustomPreview(user(Role.EMPLOYEE), null)).rejects.toThrow(
      new ForbiddenException('Role does not permit report access.'),
    );
    expect(reportTeamAbsence).not.toHaveBeenCalled();
  });

  it('normalizes one metric and preserves team-report query and response shaping', async () => {
    const reportTeamAbsence = vi.fn().mockResolvedValue({
      organizationUnitId: ORGANIZATION_UNIT_ID,
      suppression: { suppressed: false, minGroupSize: 2, population: 4 },
      totals: { requests: 3, days: 4.5 },
    });
    const service = serviceWith({ reportTeamAbsence });

    const result = await service.reportCustomPreview(user(Role.HR), {
      reportType: 'TEAM_ABSENCE',
      groupBy: 'ORGANIZATION_UNIT',
      metrics: 'requests',
      from: '2026-03-01',
      to: '2026-03-31',
      organizationUnitId: ORGANIZATION_UNIT_ID,
    });

    expect(reportTeamAbsence).toHaveBeenCalledWith(user(Role.HR), {
      organizationUnitId: ORGANIZATION_UNIT_ID,
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(result).toEqual({
      reportType: 'TEAM_ABSENCE',
      groupBy: 'ORGANIZATION_UNIT',
      from: '2026-03-01',
      to: '2026-03-31',
      suppression: { suppressed: false, minGroupSize: 2, population: 4 },
      rows: [{ group: ORGANIZATION_UNIT_ID, metrics: { requests: 3 } }],
    });
  });

  it('rejects report-specific metrics before dispatch', async () => {
    const reportTeamAbsence = vi.fn();
    const service = serviceWith({ reportTeamAbsence });

    await expect(
      service.reportCustomPreview(user(Role.HR), {
        reportType: 'TEAM_ABSENCE',
        groupBy: 'NONE',
        metrics: ['people'],
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    ).rejects.toThrow(new BadRequestException('Unsupported metrics for TEAM_ABSENCE: people'));
    expect(reportTeamAbsence).not.toHaveBeenCalled();
  });

  it('requires an organization unit before closing-report dispatch when grouped by unit', async () => {
    const reportClosingCompletion = vi.fn();
    const service = serviceWith({ reportClosingCompletion });

    await expect(
      service.reportCustomPreview(user(Role.HR), {
        reportType: 'CLOSING_COMPLETION',
        groupBy: 'ORGANIZATION_UNIT',
        metrics: ['exported'],
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'CLOSING_COMPLETION grouped by ORGANIZATION_UNIT requires organizationUnitId.',
      ),
    );
    expect(reportClosingCompletion).not.toHaveBeenCalled();
  });
});
