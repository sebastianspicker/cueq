import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionsSection } from './closing-action-sections';
import { PeriodStateSection } from './closing-period-sections';
import type { ClosingPeriod } from './closing-types';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const reviewPeriod: ClosingPeriod = {
  id: 'period-1',
  organizationUnitId: 'ou-1',
  periodStart: '2026-03-01T00:00:00.000Z',
  periodEnd: '2026-03-31T23:59:59.000Z',
  status: 'REVIEW',
  exportRuns: [],
};

describe('closing control room', () => {
  it('separates fulfilled checks from findings that still need attention', () => {
    render(
      <PeriodStateSection
        t={((key: string) => key) as never}
        period={reviewPeriod}
        checklist={{
          closingPeriodId: reviewPeriod.id,
          status: 'REVIEW',
          hasErrors: false,
          items: [
            { code: 'complete', label: 'Complete', severity: 'INFO', status: 'OK', details: '' },
            { code: 'warning', label: 'Review', severity: 'WARNING', status: 'OK', details: '' },
          ],
        }}
      />,
    );

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('openFindings').previousElementSibling).toHaveTextContent('1');
  });

  it('keeps a blocked HR decision visible with its reason and safe alternatives', () => {
    render(
      <ActionsSection
        t={((key: string) => key) as never}
        locale="de"
        loading={false}
        period={reviewPeriod}
        exportFormat="CSV_V1"
        workflowReason="Correction requested"
        onExportFormatChange={vi.fn()}
        onRunPeriodAction={vi.fn()}
        role="HR"
        checklist={{
          closingPeriodId: reviewPeriod.id,
          status: 'REVIEW',
          hasErrors: false,
          items: [],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /approve/u })).toBeDisabled();
    expect(screen.getByText('approveUnavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reopen/u })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'viewAudit' })).toHaveAttribute('href', '/de/audit');
  });
});
