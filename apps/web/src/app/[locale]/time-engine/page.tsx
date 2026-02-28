'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const DEFAULT_PAYLOAD = JSON.stringify(
  {
    week: '2026-W10',
    targetHours: 39.83,
    timezone: 'Europe/Berlin',
    holidayDates: [],
    intervals: [
      {
        start: '2026-03-07T21:00:00.000Z',
        end: '2026-03-07T22:00:00.000Z',
        type: 'WORK',
      },
    ],
  },
  null,
  2,
);

interface RuleItem {
  code: string;
  message: string;
}

interface SurchargeLine {
  category: 'NIGHT' | 'WEEKEND' | 'HOLIDAY';
  minutes: number;
  ratePercent: number;
}

interface TimeEngineResponse {
  actualHours: number;
  deltaHours: number;
  violations: RuleItem[];
  warnings: RuleItem[];
  surchargeMinutes: SurchargeLine[];
}

export default function TimeEnginePage() {
  const t = useTranslations('pages.timeEngine');
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimeEngineResponse | null>(null);

  async function evaluate() {
    setLoading(true);
    setError(null);

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setLoading(false);
      setError(t('invalidJson'));
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/v1/time-engine/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(parsedPayload),
      });

      const responseText = await response.text();
      const data = responseText ? (JSON.parse(responseText) as TimeEngineResponse) : null;

      if (!response.ok || !data) {
        throw new Error(responseText || t('requestFailed'));
      }

      setResult(data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('requestFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('apiBaseLabel')}</span>
        <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('tokenLabel')}</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="mock.eyJzdWIiOiJjLi4uIn0"
        />
      </label>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('payloadLabel')}</span>
        <textarea
          rows={18}
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          style={{ fontFamily: 'monospace', fontSize: '.9rem' }}
        />
      </label>

      <div>
        <button type="button" onClick={() => void evaluate()} disabled={loading}>
          {loading ? t('executing') : t('execute')}
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      <section style={{ display: 'grid', gap: '.75rem' }}>
        <h2>{t('resultTitle')}</h2>
        {!result ? (
          <p>{t('emptyResult')}</p>
        ) : (
          <>
            <p>
              actualHours={result.actualHours}, deltaHours={result.deltaHours}
            </p>
            <article>
              <h3>{t('violations')}</h3>
              <ul>
                {result.violations.length === 0 ? <li>0</li> : null}
                {result.violations.map((item, index) => (
                  <li key={`v-${index}`}>
                    {item.code}: {item.message}
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <h3>{t('warnings')}</h3>
              <ul>
                {result.warnings.length === 0 ? <li>0</li> : null}
                {result.warnings.map((item, index) => (
                  <li key={`w-${index}`}>
                    {item.code}: {item.message}
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <h3>{t('surcharge')}</h3>
              <ul>
                {result.surchargeMinutes.length === 0 ? <li>0</li> : null}
                {result.surchargeMinutes.map((line, index) => (
                  <li key={`s-${index}`}>
                    {line.category}: {line.minutes}m @ {line.ratePercent}%
                  </li>
                ))}
              </ul>
            </article>
          </>
        )}
      </section>
    </section>
  );
}
