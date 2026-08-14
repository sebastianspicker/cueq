import { describe, expect, it } from 'vitest';
import { computeExportChecksum, generateClosingChecklist } from '../index.js';

describe('computeExportChecksum', () => {
  const baseChecklist = generateClosingChecklist({
    missingBookings: 0,
    bookingGaps: 0,
    openCorrectionRequests: 0,
    openLeaveRequests: 0,
    ruleViolations: 0,
    rosterMismatches: 0,
    balanceAnomalies: 0,
  });

  it('produces identical checksum for same period and data', () => {
    const input = {
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], totalHours: 320 },
    };

    const a = computeExportChecksum(input);
    const b = computeExportChecksum(input);

    expect(a.checksum).toBe(b.checksum);
    expect(a.periodId).toBe('period-2026-03');
    expect(a.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces identical checksum for semantically identical objects with different key order', () => {
    const ordered = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], nested: { alpha: 1, beta: 2 }, totalHours: 320 },
    });

    const reordered = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { totalHours: 320, nested: { beta: 2, alpha: 1 }, employees: ['e1', 'e2'] },
    });

    expect(ordered.checksum).toBe(reordered.checksum);
  });

  it('produces different checksum when data changes', () => {
    const inputA = {
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], totalHours: 320 },
    };

    const inputB = {
      ...inputA,
      data: { employees: ['e1', 'e2'], totalHours: 321 },
    };

    const a = computeExportChecksum(inputA);
    const b = computeExportChecksum(inputB);

    expect(a.checksum).not.toBe(b.checksum);
  });

  it('produces different checksum for different periods with same data', () => {
    const data = { employees: ['e1'], totalHours: 160 };

    const march = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data,
    });

    const april = computeExportChecksum({
      periodId: 'period-2026-04',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      checklist: baseChecklist,
      data,
    });

    expect(march.checksum).not.toBe(april.checksum);
  });
});
