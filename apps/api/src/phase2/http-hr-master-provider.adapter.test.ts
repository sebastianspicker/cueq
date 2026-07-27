import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter.js';

describe('HttpHrMasterProvider', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.HR_MASTER_API_URL = 'https://hr-master.local/api/v1/people';
    process.env.HR_MASTER_API_TOKEN = 'secret-token';
    process.env.HR_MASTER_API_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HR_MASTER_API_URL;
    delete process.env.HR_MASTER_API_TOKEN;
    delete process.env.HR_MASTER_API_TIMEOUT_MS;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('maps a valid upstream payload and disables redirects', async () => {
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

    const rows = await new HttpHrMasterProvider().fetchMasterRecords();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe('hrapi200');
    expect(rows[0]?.email).toBe('hanna.api@cueq.local');
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://hr-master.local/api/v1/people'),
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });

  it('rejects an invalid upstream payload shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ records: [{ externalId: 'missing-fields' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    ['ftp://hr-master.local/people', 'HR_MASTER_API_URL must use HTTP or HTTPS.'],
    [
      'https://user:password@hr-master.local/people',
      'HR_MASTER_API_URL must not include credentials.',
    ],
  ])('rejects unsafe configured URL %s', async (url, expectedMessage) => {
    process.env.HR_MASTER_API_URL = url;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).rejects.toMatchObject({
      message: expectedMessage,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires HTTPS in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HR_MASTER_API_URL = 'http://hr-master.internal/people';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose upstream network error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connect ECONNREFUSED secret.internal.example'),
    );

    await expect(new HttpHrMasterProvider().fetchMasterRecords()).rejects.toMatchObject({
      message: 'Failed to fetch HR master records.',
    });
  });
});
