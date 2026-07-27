import { afterEach, describe, expect, it } from 'vitest';
import { ReportingComplianceHelper } from '../reporting-compliance.helper.js';

const originalMinimum = process.env.REPORT_MIN_GROUP_SIZE;

function helper(): ReportingComplianceHelper {
  return new ReportingComplianceHelper(null as never, null as never, null as never);
}

afterEach(() => {
  if (originalMinimum === undefined) {
    delete process.env.REPORT_MIN_GROUP_SIZE;
  } else {
    process.env.REPORT_MIN_GROUP_SIZE = originalMinimum;
  }
});

describe('ReportingComplianceHelper privacy threshold', () => {
  it('never permits configuration below the governance minimum', () => {
    process.env.REPORT_MIN_GROUP_SIZE = '1';
    expect(helper().minGroupSize()).toBe(5);
  });

  it('falls back safely for invalid configuration', () => {
    process.env.REPORT_MIN_GROUP_SIZE = 'not-a-number';
    expect(helper().minGroupSize()).toBe(5);
  });

  it('allows stricter configured thresholds', () => {
    process.env.REPORT_MIN_GROUP_SIZE = '8';
    expect(helper().minGroupSize()).toBe(8);
  });
});
