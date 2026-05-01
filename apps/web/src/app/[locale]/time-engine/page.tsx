'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

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
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
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
      const data = await apiRequest<TimeEngineResponse>('/v1/time-engine/evaluate', {
        method: 'POST',
        body: JSON.stringify(parsedPayload),
      });
      setResult(data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('requestFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')}>
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <SectionCard>
        <label className="cq-form-field">
          <span>{t('payloadLabel')}</span>
          <textarea
            rows={18}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            className="cq-code-input"
          />
        </label>
        <div className="cq-space-top-sm">
          <button type="button" onClick={() => void evaluate()} disabled={loading}>
            {loading ? t('executing') : t('execute')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner error={error} />

      <SectionCard>
        <h2>{t('resultTitle')}</h2>
        {!result ? (
          <p>{t('emptyResult')}</p>
        ) : (
          <>
            <div className="cq-stat-row">
              <div className="cq-stat-card">
                <span className="cq-stat-label">{t('actualHoursLabel')}</span>
                <span className="cq-stat-value">{result.actualHours}</span>
              </div>
              <div className="cq-stat-card">
                <span className="cq-stat-label">{t('deltaHoursLabel')}</span>
                <span className="cq-stat-value">{result.deltaHours}</span>
              </div>
              <div className="cq-stat-card">
                <span className="cq-stat-label">{t('violations')}</span>
                <span
                  className="cq-stat-value"
                  style={{
                    color: result.violations.length > 0 ? 'var(--cq-error)' : 'var(--cq-ok)',
                  }}
                >
                  {result.violations.length}
                </span>
              </div>
              <div className="cq-stat-card">
                <span className="cq-stat-label">{t('warnings')}</span>
                <span
                  className="cq-stat-value"
                  style={{ color: result.warnings.length > 0 ? 'var(--cq-warn)' : 'var(--cq-ok)' }}
                >
                  {result.warnings.length}
                </span>
              </div>
            </div>

            {result.violations.length > 0 ? (
              <article>
                <h3>{t('violations')}</h3>
                <ul className="cq-list-stack">
                  {result.violations.map((item, index) => (
                    <li key={`v-${index}`} className="cq-severity-error">
                      <strong>{item.code}</strong>: {item.message}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {result.warnings.length > 0 ? (
              <article>
                <h3>{t('warnings')}</h3>
                <ul className="cq-list-stack">
                  {result.warnings.map((item, index) => (
                    <li key={`w-${index}`} className="cq-severity-warning">
                      <strong>{item.code}</strong>: {item.message}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {result.surchargeMinutes.length > 0 ? (
              <article>
                <h3>{t('surcharge')}</h3>
                <table className="cq-data-table">
                  <caption className="cq-sr-only">{t('surcharge')}</caption>
                  <thead>
                    <tr>
                      <th>{t('surchargeCategory')}</th>
                      <th>{t('surchargeMinutes')}</th>
                      <th>{t('surchargeRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.surchargeMinutes.map((line, index) => (
                      <tr key={`s-${index}`}>
                        <td>{line.category}</td>
                        <td>{line.minutes}m</td>
                        <td>{line.ratePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ) : null}
          </>
        )}
      </SectionCard>
    </PageShell>
  );
}
