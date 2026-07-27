import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportResults } from './report-results';

const teamAbsence = {
  organizationUnitId: 'faculty-1',
  from: '2026-03-01',
  to: '2026-03-31',
  suppression: { suppressed: false, minGroupSize: 5, population: 12 },
  totals: { requests: 4, days: 8 },
  buckets: [],
};

function renderResults(loaded: boolean) {
  render(
    <ReportResults
      t={((key: string) => key) as never}
      loaded={loaded}
      teamAbsence={teamAbsence}
      oeOvertime={null}
      closingCompletion={null}
      auditSummary={null}
      complianceSummary={null}
    />,
  );
}

describe('report results', () => {
  it('keeps fetched report data hidden until the report request completes', () => {
    renderResults(false);

    expect(screen.queryByRole('heading', { name: 'teamAbsenceHeading' })).not.toBeInTheDocument();
  });

  it('renders the loaded report totals and suppression status', () => {
    renderResults(true);

    expect(screen.getByRole('heading', { name: 'teamAbsenceHeading' })).toBeInTheDocument();
    expect(screen.getByText('absenceTotals')).toBeInTheDocument();
    expect(screen.getByText('suppressionInactive')).toBeInTheDocument();
  });
});
