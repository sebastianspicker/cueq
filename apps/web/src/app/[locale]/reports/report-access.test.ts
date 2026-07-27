import { describe, expect, it } from 'vitest';
import { canLoadSensitiveReportSummaries } from './report-access';

describe('report summary access', () => {
  it('keeps team leads on the report summaries their API role permits', () => {
    expect(canLoadSensitiveReportSummaries('TEAM_LEAD')).toBe(false);
  });

  it.each(['HR', 'ADMIN', 'DATA_PROTECTION', 'WORKS_COUNCIL'])(
    'allows %s to load audit and compliance summaries',
    (role) => {
      expect(canLoadSensitiveReportSummaries(role)).toBe(true);
    },
  );

  it('does not assume sensitive access before the session role is known', () => {
    expect(canLoadSensitiveReportSummaries(undefined)).toBe(false);
  });
});
