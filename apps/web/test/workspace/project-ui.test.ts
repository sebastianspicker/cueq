import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { AllocateProjectTimeSchema, type ProjectReport } from '@cueq/contracts';
import { describe, expect, it } from 'vitest';
import { ProjectReportTotals } from '../../src/app/[locale]/projects/project-report-totals';
import { assignmentRequestTarget } from '../../src/platform/http/assignment-target';
import en from '../../src/messages/en.json';

function renderReport(suppressed: boolean, totals: ProjectReport['totals']) {
  const report: ProjectReport = {
    projectId: 'synthetic',
    code: 'synthetic',
    name: 'Synthetic project',
    parentId: null,
    from: '2026-01-01T00:00:00.000Z',
    to: '2027-01-01T00:00:00.000Z',
    suppression: { suppressed, population: 1, minGroupSize: 5 },
    totals,
  };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'en',
      messages: en,
      timeZone: 'Europe/Berlin',
      children: createElement(ProjectReportTotals, { report }),
    }),
  );
}

describe('project UI boundaries', () => {
  it('does not put suppressed aggregate totals into markup even if a response includes them', () => {
    const html = renderReport(true, {
      budgetHours: 12345,
      recordedHours: 98765,
      varianceHours: 86420,
    });
    expect(html).toContain('reporting privacy threshold');
    expect(html).not.toContain('12345');
    expect(html).not.toContain('98765');
    expect(html).not.toContain('86420');
  });
  it('renders authorized aggregate values and handles absent totals', () => {
    expect(
      renderReport(false, { budgetHours: 100, recordedHours: 75, varianceHours: 25 }),
    ).toContain('75');
    expect(renderReport(false, null)).toContain('reporting privacy threshold');
  });
  it('preserves an explicitly selected booking appointment for allocation, independently from actor context', () => {
    const id = `c${'a'.repeat(24)}`;
    const payload = AllocateProjectTimeSchema.parse({
      projectId: id,
      bookingId: id,
      assignmentId: id,
      minutes: 30,
      note: null,
    });
    const init = { method: 'POST', body: JSON.stringify(payload) };
    expect(
      assignmentRequestTarget(
        '/v1/projects/time/allocations',
        init,
        'different-appointment',
        'actor',
      ).init,
    ).toEqual(init);
    expect(payload).not.toHaveProperty('startTime');
    expect(payload).not.toHaveProperty('endTime');
  });
});
