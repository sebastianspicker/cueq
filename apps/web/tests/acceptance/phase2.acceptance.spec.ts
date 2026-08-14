import { expect, test } from '@playwright/test';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('serves default German dashboard and English locale route', async ({ request }) => {
    const de = await request.get('http://localhost:3000/de/dashboard');
    const en = await request.get('http://localhost:3000/en/dashboard');
    const bookings = await request.get('http://localhost:3000/de/bookings');
    const oncall = await request.get('http://localhost:3000/de/oncall');
    const closing = await request.get('http://localhost:3000/de/closing');
    const approvals = await request.get('http://localhost:3000/de/approvals');
    const reports = await request.get('http://localhost:3000/de/reports');
    const policyAdmin = await request.get('http://localhost:3000/de/policy-admin');
    const audit = await request.get('http://localhost:3000/de/audit');
    const settings = await request.get('http://localhost:3000/de/settings');
    const timeEngineDe = await request.get('http://localhost:3000/de/time-engine');
    const timeEngineEn = await request.get('http://localhost:3000/en/time-engine');

    expect(de.status()).toBe(200);
    expect(en.status()).toBe(200);
    expect(bookings.status()).toBe(200);
    expect(oncall.status()).toBe(200);
    expect(closing.status()).toBe(200);
    expect(approvals.status()).toBe(200);
    expect(reports.status()).toBe(200);
    expect(policyAdmin.status()).toBe(200);
    expect(audit.status()).toBe(200);
    expect(settings.status()).toBe(200);
    expect(timeEngineDe.status()).toBe(200);
    expect(timeEngineEn.status()).toBe(200);

    expect(await de.text()).toContain('Tagesfortschritt');
    expect(await en.text()).toContain('Day progress');
    expect(await bookings.text()).toContain('Meine Buchungen');
    expect(await oncall.text()).toContain('Rufbereitschaft');
    expect(await closing.text()).toContain('Monatsabschluss');
    expect(await approvals.text()).toContain('Freigabe-Postfach');
    expect(await reports.text()).toContain('Berichte');
    expect(await policyAdmin.text()).toContain('Policy-Administration');
    expect(await audit.text()).toContain('Audit-Zusammenfassung');
    expect(await settings.text()).toContain('Einstellungen');
    expect(await timeEngineDe.text()).toContain('Time-Engine-Evaluator');
    expect(await timeEngineEn.text()).toContain('Time Engine Evaluator');
  });
});
