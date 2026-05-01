import { describe, expect, it } from 'vitest';
import { ClosingStatus, Role } from '@cueq/database';
import {
  closingBalanceAnomalyHours,
  closingBookingGapMinutes,
  closingCutoffDay,
  closingCutoffHour,
  escapeXml,
  parseMonthToRange,
  resolveTimeZoneOffsetMinutes,
  toClosingActorRole,
  toPersistenceClosingStatus,
  zonedDateTimeToUtcDate,
} from '../closing-utils';

describe('toClosingActorRole', () => {
  it('maps HR → HR', () => expect(toClosingActorRole(Role.HR)).toBe('HR'));
  it('maps ADMIN → ADMIN', () => expect(toClosingActorRole(Role.ADMIN)).toBe('ADMIN'));
  it('maps TEAM_LEAD → TEAM_LEAD', () =>
    expect(toClosingActorRole(Role.TEAM_LEAD)).toBe('TEAM_LEAD'));
  it('maps EMPLOYEE → EMPLOYEE (fallback)', () =>
    expect(toClosingActorRole(Role.EMPLOYEE)).toBe('EMPLOYEE'));
  it('maps SHIFT_PLANNER → EMPLOYEE (safe default)', () =>
    expect(toClosingActorRole(Role.SHIFT_PLANNER)).toBe('EMPLOYEE'));
  it('maps PAYROLL → EMPLOYEE (safe default)', () =>
    expect(toClosingActorRole(Role.PAYROLL)).toBe('EMPLOYEE'));
});

describe('toPersistenceClosingStatus', () => {
  it('maps APPROVED → CLOSED', () =>
    expect(toPersistenceClosingStatus('APPROVED')).toBe(ClosingStatus.CLOSED));
  it('maps OPEN → OPEN', () => expect(toPersistenceClosingStatus('OPEN')).toBe(ClosingStatus.OPEN));
  it('maps REVIEW → REVIEW', () =>
    expect(toPersistenceClosingStatus('REVIEW')).toBe(ClosingStatus.REVIEW));
  it('maps EXPORTED → EXPORTED', () =>
    expect(toPersistenceClosingStatus('EXPORTED')).toBe(ClosingStatus.EXPORTED));
});

describe('escapeXml', () => {
  it('escapes ampersand', () => expect(escapeXml('a & b')).toBe('a &amp; b'));
  it('escapes less-than', () => expect(escapeXml('<tag>')).toBe('&lt;tag&gt;'));
  it('escapes double quote', () => expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;'));
  it('escapes single quote', () => expect(escapeXml("O'Brien")).toBe('O&apos;Brien'));
  it('leaves safe strings unchanged', () => expect(escapeXml('Hello World')).toBe('Hello World'));
  it('escapes multiple special chars in one string', () => {
    expect(escapeXml('<a href="x">O\'s & Co</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&apos;s &amp; Co&lt;/a&gt;',
    );
  });
});

describe('parseMonthToRange', () => {
  it('returns UTC midnight start and end-of-day end for a valid month', () => {
    const { from, to } = parseMonthToRange('2026-04');
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-04-30T23:59:59.000Z');
  });

  it('handles February in a non-leap year', () => {
    const { from, to } = parseMonthToRange('2026-02');
    expect(from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-02-28T23:59:59.000Z');
  });

  it('handles February in a leap year', () => {
    const { to } = parseMonthToRange('2028-02');
    expect(to.toISOString()).toBe('2028-02-29T23:59:59.000Z');
  });

  it('handles December correctly (month 12)', () => {
    const { from, to } = parseMonthToRange('2026-12');
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });

  it('throws for invalid format', () => {
    expect(() => parseMonthToRange('2026')).toThrow();
    expect(() => parseMonthToRange('2026-00')).toThrow();
    expect(() => parseMonthToRange('2026-13')).toThrow();
  });
});

describe('closingCutoffDay', () => {
  it('returns default of 3 when env is not set', () => {
    delete process.env.CLOSING_CUTOFF_DAY;
    expect(closingCutoffDay()).toBe(3);
  });

  it('clamps to 1 minimum', () => {
    process.env.CLOSING_CUTOFF_DAY = '0';
    expect(closingCutoffDay()).toBe(1);
    delete process.env.CLOSING_CUTOFF_DAY;
  });

  it('clamps to 28 maximum', () => {
    process.env.CLOSING_CUTOFF_DAY = '31';
    expect(closingCutoffDay()).toBe(28);
    delete process.env.CLOSING_CUTOFF_DAY;
  });

  it('truncates fractional values', () => {
    process.env.CLOSING_CUTOFF_DAY = '5.9';
    expect(closingCutoffDay()).toBe(5);
    delete process.env.CLOSING_CUTOFF_DAY;
  });
});

describe('closingCutoffHour', () => {
  it('returns default of 12 when env is not set', () => {
    delete process.env.CLOSING_CUTOFF_HOUR;
    expect(closingCutoffHour()).toBe(12);
  });

  it('clamps to 0 minimum', () => {
    process.env.CLOSING_CUTOFF_HOUR = '-5';
    expect(closingCutoffHour()).toBe(0);
    delete process.env.CLOSING_CUTOFF_HOUR;
  });

  it('clamps to 23 maximum', () => {
    process.env.CLOSING_CUTOFF_HOUR = '25';
    expect(closingCutoffHour()).toBe(23);
    delete process.env.CLOSING_CUTOFF_HOUR;
  });
});

describe('closingBookingGapMinutes', () => {
  it('returns default of 240 when env is not set', () => {
    delete process.env.CLOSING_BOOKING_GAP_MINUTES;
    expect(closingBookingGapMinutes()).toBe(240);
  });

  it('returns configured value when valid', () => {
    process.env.CLOSING_BOOKING_GAP_MINUTES = '120';
    expect(closingBookingGapMinutes()).toBe(120);
    delete process.env.CLOSING_BOOKING_GAP_MINUTES;
  });

  it('returns default for values below minimum of 30', () => {
    process.env.CLOSING_BOOKING_GAP_MINUTES = '15';
    expect(closingBookingGapMinutes()).toBe(240);
    delete process.env.CLOSING_BOOKING_GAP_MINUTES;
  });
});

describe('closingBalanceAnomalyHours', () => {
  it('returns default of 40 when env is not set', () => {
    delete process.env.CLOSING_BALANCE_ANOMALY_HOURS;
    expect(closingBalanceAnomalyHours()).toBe(40);
  });

  it('returns configured value', () => {
    process.env.CLOSING_BALANCE_ANOMALY_HOURS = '20';
    expect(closingBalanceAnomalyHours()).toBe(20);
    delete process.env.CLOSING_BALANCE_ANOMALY_HOURS;
  });

  it('returns default for non-positive value', () => {
    process.env.CLOSING_BALANCE_ANOMALY_HOURS = '0';
    expect(closingBalanceAnomalyHours()).toBe(40);
    delete process.env.CLOSING_BALANCE_ANOMALY_HOURS;
  });
});

describe('resolveTimeZoneOffsetMinutes', () => {
  it('returns +60 for Europe/Berlin in summer (CEST = UTC+2 → 120)', () => {
    // June 15 = CEST = UTC+2 = +120 minutes
    const summer = new Date('2026-06-15T12:00:00.000Z');
    expect(resolveTimeZoneOffsetMinutes(summer, 'Europe/Berlin')).toBe(120);
  });

  it('returns +60 for Europe/Berlin in winter (CET = UTC+1 → 60)', () => {
    // January 15 = CET = UTC+1 = +60 minutes
    const winter = new Date('2026-01-15T12:00:00.000Z');
    expect(resolveTimeZoneOffsetMinutes(winter, 'Europe/Berlin')).toBe(60);
  });

  it('returns 0 for UTC', () => {
    const d = new Date('2026-04-19T10:00:00.000Z');
    expect(resolveTimeZoneOffsetMinutes(d, 'UTC')).toBe(0);
  });
});

describe('zonedDateTimeToUtcDate', () => {
  it('converts a Berlin winter datetime to UTC correctly', () => {
    // CET = UTC+1; 12:00 Berlin winter → 11:00 UTC
    const utc = zonedDateTimeToUtcDate({
      year: 2026,
      month: 1,
      day: 15,
      hour: 12,
      minute: 0,
      timeZone: 'Europe/Berlin',
    });
    expect(utc.toISOString()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('converts a Berlin summer datetime to UTC correctly', () => {
    // CEST = UTC+2; 12:00 Berlin summer → 10:00 UTC
    const utc = zonedDateTimeToUtcDate({
      year: 2026,
      month: 6,
      day: 15,
      hour: 12,
      minute: 0,
      timeZone: 'Europe/Berlin',
    });
    expect(utc.toISOString()).toBe('2026-06-15T10:00:00.000Z');
  });
});
