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
            <p>
              {t('actualHoursLabel')}: {result.actualHours}, {t('deltaHoursLabel')}:{' '}
              {result.deltaHours}
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
      </SectionCard>
    </PageShell>
  );
}
