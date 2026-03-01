'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface DashboardSummary {
  personId: string;
  modelName: string;
  todayTargetHours: number;
  currentBalanceHours: number;
  todayBookingsCount: number;
  hasFirstBooking: boolean;
  showOrientation: boolean;
  clockInTimeTypeId: string | null;
  quickActions: string[];
}

interface ClosingPeriodLockedErrorPayload {
  code?: string;
  periodEnd?: string;
}

class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isClosingPeriodLockedError(
  payload: unknown,
): payload is ClosingPeriodLockedErrorPayload & {
  code: 'CLOSING_PERIOD_LOCKED';
  periodEnd: string;
} {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as ClosingPeriodLockedErrorPayload;
  return candidate.code === 'CLOSING_PERIOD_LOCKED' && typeof candidate.periodEnd === 'string';
}

export default function DashboardPage() {
  const t = useTranslations('pages.dashboard');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';

  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [overtimeHours, setOvertimeHours] = useState('2');
  const [overtimePeriodStart, setOvertimePeriodStart] = useState('2026-03-01T00:00:00.000Z');
  const [overtimePeriodEnd, setOvertimePeriodEnd] = useState('2026-03-31T23:59:59.000Z');
  const [overtimeReason, setOvertimeReason] = useState(
    'Requesting overtime approval for this period.',
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ''), [apiBaseUrl]);

  async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    const parsed = text ? parseJson(text) : null;

    if (!response.ok) {
      const message =
        typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? String(parsed.message)
          : text || t('requestFailed');
      throw new ApiRequestError(response.status, `${response.status}: ${message}`, parsed);
    }

    return parsed as T;
  }

  async function loadSummary() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const nextSummary = await apiRequest<DashboardSummary>('/v1/dashboard/me');
      setSummary(nextSummary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function clockIn() {
    if (!summary?.clockInTimeTypeId) {
      setError(t('clockInTypeMissing'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const bookingPayload = {
        personId: summary.personId,
        timeTypeId: summary.clockInTimeTypeId,
        source: 'MANUAL',
        note: 'Dashboard quick action clock-in',
      };

      try {
        await apiRequest('/v1/bookings', {
          method: 'POST',
          body: JSON.stringify({
            ...bookingPayload,
            startTime: new Date().toISOString(),
          }),
        });
      } catch (cause) {
        if (
          cause instanceof ApiRequestError &&
          cause.status === 409 &&
          isClosingPeriodLockedError(cause.payload)
        ) {
          const retryStartTime = new Date(
            new Date(cause.payload.periodEnd).getTime() + 60_000,
          ).toISOString();
          await apiRequest('/v1/bookings', {
            method: 'POST',
            body: JSON.stringify({
              ...bookingPayload,
              startTime: retryStartTime,
            }),
          });
        } else {
          throw cause;
        }
      }

      await loadSummary();
      setMessage(t('clockInSuccess'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function requestOvertimeApproval() {
    if (!summary) {
      setError(t('loadSummaryFirst'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/workflows/overtime-approvals', {
        method: 'POST',
        body: JSON.stringify({
          personId: summary.personId,
          periodStart: overtimePeriodStart,
          periodEnd: overtimePeriodEnd,
          overtimeHours: Number(overtimeHours),
          reason: overtimeReason,
        }),
      });
      setMessage(t('overtimeRequested'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
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

      <div>
        <button type="button" disabled={loading} onClick={() => void loadSummary()}>
          {loading ? t('loading') : t('loadSummary')}
        </button>
      </div>

      {message ? <p style={{ color: '#0f766e' }}>{message}</p> : null}
      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      {summary ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('summaryTitle')}</h2>
          <p>
            {t('modelName')}: {summary.modelName}
          </p>
          <p>
            {t('todayTargetHours')}: {summary.todayTargetHours.toFixed(2)}
          </p>
          <p>
            {t('currentBalanceHours')}: {summary.currentBalanceHours.toFixed(2)}
          </p>
          <p>
            {t('todayBookingsCount')}: {summary.todayBookingsCount}
          </p>
        </article>
      ) : null}

      {summary?.showOrientation ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('orientationTitle')}</h2>
          <p>{t('orientationBody')}</p>
        </article>
      ) : null}

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('quickActionsTitle')}</h2>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={loading || !summary} onClick={() => void clockIn()}>
            {t('clockIn')}
          </button>
          <Link href={`/${locale}/leave`}>{t('requestLeave')}</Link>
        </div>
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('overtimeTitle')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('overtimeHours')}</span>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={overtimeHours}
              onChange={(event) => setOvertimeHours(event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('overtimeReason')}</span>
            <input
              value={overtimeReason}
              onChange={(event) => setOvertimeReason(event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('overtimePeriodStart')}</span>
            <input
              value={overtimePeriodStart}
              onChange={(event) => setOvertimePeriodStart(event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('overtimePeriodEnd')}</span>
            <input
              value={overtimePeriodEnd}
              onChange={(event) => setOvertimePeriodEnd(event.target.value)}
            />
          </label>
        </div>
        <div style={{ marginTop: '.75rem' }}>
          <button
            type="button"
            disabled={loading || !summary}
            onClick={() => void requestOvertimeApproval()}
          >
            {t('requestOvertime')}
          </button>
        </div>
      </article>
    </section>
  );
}
