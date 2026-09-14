import { BadGatewayException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter.js';

const record = {
  externalId: 'employee-1',
  firstName: 'Test',
  lastName: 'Person',
  email: 'test@example.test',
  role: 'EMPLOYEE',
  organizationUnit: 'Test',
  workTimeModel: 'Default',
  weeklyHours: '40',
  dailyTargetHours: '8',
};

describe('HttpHrMasterProvider employment dates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HR_MASTER_API_URL;
  });

  it('preserves valid optional employment dates from the provider', async () => {
    process.env.HR_MASTER_API_URL = 'https://hr.example.test/employees';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue([
            { ...record, employmentStartDate: '2026-09-08', employmentEndDate: '2027-09-07' },
          ]),
      }),
    );

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).resolves.toEqual([
      expect.objectContaining({
        employmentStartDate: '2026-09-08',
        employmentEndDate: '2027-09-07',
      }),
    ]);
  });

  it('rejects an impossible provider date at the adapter boundary', async () => {
    process.env.HR_MASTER_API_URL = 'https://hr.example.test/employees';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([{ ...record, employmentStartDate: '2026-02-30' }]),
      }),
    );

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
