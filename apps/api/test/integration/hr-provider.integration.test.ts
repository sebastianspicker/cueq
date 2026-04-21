import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException } from '@nestjs/common';
import { HttpHrMasterProvider } from '../../src/phase2/http-hr-master-provider.adapter';

describe('Phase 3 integration: HTTP HR master provider', () => {
  beforeEach(() => {
    process.env.HR_MASTER_API_URL = 'https://hr-master.local/api/v1/people';
    process.env.HR_MASTER_API_TOKEN = 'secret-token';
    process.env.HR_MASTER_API_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HR_MASTER_API_URL;
    delete process.env.HR_MASTER_API_TOKEN;
    delete process.env.HR_MASTER_API_TIMEOUT_MS;
  });

  it('maps valid upstream payload into HrMasterRecord list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            {
              externalId: 'hrapi200',
              firstName: 'Hanna',
              lastName: 'Api',
              email: 'hanna.api@cueq.local',
              role: 'EMPLOYEE',
              organizationUnit: 'Verwaltung',
              workTimeModel: 'Gleitzeit Vollzeit',
              weeklyHours: '39.83',
              dailyTargetHours: '7.97',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const provider = new HttpHrMasterProvider();
    const rows = await provider.fetchMasterRecords();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe('hrapi200');
    expect(rows[0]?.email).toBe('hanna.api@cueq.local');
  });

  it('rejects invalid upstream payload shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ records: [{ externalId: 'missing-fields' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const provider = new HttpHrMasterProvider();
    await expect(provider.fetchMasterRecords()).rejects.toBeInstanceOf(BadGatewayException);
  });
});
