import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import {
  splitAccountPayload,
  emptyAccountSegment,
} from '../../src/app/[locale]/employment/time-account-draft';
import { PrepareClosingAccounts } from '../../src/app/[locale]/closing/closing-prepare-accounts';
import type { ClosingPeriod } from '../../src/app/[locale]/closing/closing-types';
import en from '../../src/messages/en.json';

const updatedAt = '2026-09-07T12:00:00.000Z';
const segments = [
  {
    periodStart: '2027-01-01T00:00',
    periodEnd: '2027-01-15T00:00',
    targetHours: '40',
    actualHours: '42',
    balance: '2',
    overtimeHours: '1.25',
  },
  {
    periodStart: '2027-01-15T00:00',
    periodEnd: '2027-02-01T00:00',
    targetHours: '60',
    actualHours: '63',
    balance: '3',
    overtimeHours: '2.75',
  },
];

describe('explicit time-account split', () => {
  it('preserves every manually supplied value, overtime, and account revision', () => {
    const payload = splitAccountPayload({ updatedAt }, 'Synthetic reviewed split', segments);
    expect(payload.expectedUpdatedAt).toBe(updatedAt);
    expect(payload.segments.map((segment) => segment.targetHours)).toEqual([40, 60]);
    expect(payload.segments.map((segment) => segment.actualHours)).toEqual([42, 63]);
    expect(payload.segments.map((segment) => segment.balance)).toEqual([2, 3]);
    expect(payload.segments.map((segment) => segment.overtimeHours)).toEqual([1.25, 2.75]);
    expect(payload.segments[0]?.periodStart).toBe('2026-12-31T23:00:00.000Z');
    expect(payload).not.toHaveProperty('assignmentId');
  });
  it('does not fill blank segments or infer balances', () => {
    expect(emptyAccountSegment()).toEqual({
      periodStart: '',
      periodEnd: '',
      targetHours: '',
      actualHours: '',
      balance: '',
      overtimeHours: '',
    });
    expect(() =>
      splitAccountPayload({ updatedAt }, 'Synthetic reviewed split', [
        emptyAccountSegment(),
        segments[0]!,
      ]),
    ).toThrow();
    expect(() =>
      splitAccountPayload({ updatedAt }, 'Synthetic reviewed split', [
        { ...segments[0]!, balance: '100' },
        segments[1]!,
      ]),
    ).toThrow();
  });
});

describe('closing account preparation', () => {
  function render(periodId: string, status: string) {
    const period: ClosingPeriod = {
      id: periodId,
      organizationUnitId: null,
      periodStart: '2027-01-01T00:00:00.000Z',
      periodEnd: '2027-02-01T00:00:00.000Z',
      status,
      exportRuns: [],
    };
    return renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: 'en',
        messages: en,
        timeZone: 'Europe/Berlin',
        children: createElement(PrepareClosingAccounts, {
          period,
          disabled: false,
          onPrepare: () => {},
          result: { closingPeriodId: 'old-period', created: 17, existing: 23 },
        }),
      }),
    );
  }
  it('does not show preparation counts for a different selected period', () => {
    expect(render('new-period', 'OPEN')).not.toContain('17 accounts created');
    expect(render('old-period', 'OPEN')).toContain('17 accounts created');
  });
  it('disables preparation outside the open period', () => {
    expect(render('old-period', 'REVIEW')).toContain('disabled=""');
    expect(render('old-period', 'REVIEW')).toContain('available only while the period is open');
  });
});
