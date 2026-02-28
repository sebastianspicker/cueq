import { expect, test } from '@playwright/test';

const employeeToken =
  'mock.eyJzdWIiOiJjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTAwIiwiZW1haWwiOiJlbXBsb3llZUBjdWVxLmxvY2FsIiwicm9sZSI6IkVNUExPWUVFIiwib3JnYW5pemF0aW9uVW5pdElkIjoiYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSJ9';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('serves default German dashboard and English locale route', async ({ request }) => {
    const de = await request.get('http://localhost:3000/de/dashboard');
    const en = await request.get('http://localhost:3000/en/dashboard');
    const closing = await request.get('http://localhost:3000/de/closing');
    const reports = await request.get('http://localhost:3000/de/reports');
    const timeEngineDe = await request.get('http://localhost:3000/de/time-engine');
    const timeEngineEn = await request.get('http://localhost:3000/en/time-engine');

    expect(de.status()).toBe(200);
    expect(en.status()).toBe(200);
    expect(closing.status()).toBe(200);
    expect(reports.status()).toBe(200);
    expect(timeEngineDe.status()).toBe(200);
    expect(timeEngineEn.status()).toBe(200);

    expect(await de.text()).toContain('Soll/Ist');
    expect(await en.text()).toContain('Target/actual');
    expect(await closing.text()).toContain('Monatsabschluss');
    expect(await reports.text()).toContain('Berichte');
    expect(await timeEngineDe.text()).toContain('Time-Engine-Evaluator');
    expect(await timeEngineEn.text()).toContain('Time Engine Evaluator');
  });

  test('serves authenticated API identity endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3001/v1/me', {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.role).toBe('EMPLOYEE');
  });
});
