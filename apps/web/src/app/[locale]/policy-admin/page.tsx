'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

const WORKFLOW_TYPES = [
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
  'POST_CLOSE_CORRECTION',
] as const;

interface PolicyPayload {
  [key: string]: unknown;
}

interface PolicyEntry {
  id: string;
  type: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  description?: string | null;
  payload: PolicyPayload;
}

interface PolicyBundleResponse {
  asOf: string;
  policies: PolicyEntry[];
}

interface WorkflowPolicyVersion {
  id: string;
  type: string;
  escalationDeadlineHours: number;
  escalationRoles: string[];
  maxDelegationDepth: number;
  activeFrom: string;
  activeTo?: string | null;
}

interface WorkflowPolicyHistoryResponse {
  entries: WorkflowPolicyVersion[];
  total: number;
}

interface TimeThresholds {
  dailyMaxMinutes: number;
  minRestMinutes: number;
}

export default function PolicyAdminPage() {
  const t = useTranslations('pages.policyAdmin');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

  // Legacy bundle view
  const [asOf, setAsOf] = useState('2026-03-15');
  const [bundle, setBundle] = useState<PolicyBundleResponse | null>(null);

  // Workflow policy editor
  const [wfType, setWfType] = useState<string>(WORKFLOW_TYPES[0]);
  const [wfEscDeadline, setWfEscDeadline] = useState(48);
  const [wfEscRoles, setWfEscRoles] = useState('HR,ADMIN');
  const [wfMaxDepth, setWfMaxDepth] = useState(5);

  // Workflow policy version history
  const [wfHistory, setWfHistory] = useState<WorkflowPolicyHistoryResponse | null>(null);

  // Time thresholds editor
  const [dailyMax, setDailyMax] = useState(600);
  const [minRest, setMinRest] = useState(660);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBundle(null);
    setWfHistory(null);
    setMessage(null);
    setError(null);
  }, [apiBaseUrl, token]);

  function withFeedback<T>(fn: () => Promise<T>): Promise<T> {
    setLoading(true);
    setError(null);
    setMessage(null);
    return fn().finally(() => {
      setLoading(false);
    });
  }

  async function loadBundle() {
    await withFeedback(async () => {
      const query = new URLSearchParams();
      if (asOf) query.set('asOf', asOf);
      const data = await apiRequest<PolicyBundleResponse>(`/v1/policies?${query.toString()}`);
      setBundle(data);
      setMessage(t('bundleLoaded'));
    }).catch((cause: unknown) => {
      setBundle(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadWorkflowPolicy() {
    await withFeedback(async () => {
      const data = await apiRequest<WorkflowPolicyVersion>(`/v1/workflows/policies/${wfType}`);
      setWfEscDeadline(data.escalationDeadlineHours);
      setWfEscRoles(data.escalationRoles.join(','));
      setWfMaxDepth(data.maxDelegationDepth);
      setMessage(t('workflowPolicyLoaded'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function saveWorkflowPolicy() {
    await withFeedback(async () => {
      await apiRequest(`/v1/workflows/policies/${wfType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalationDeadlineHours: wfEscDeadline,
          escalationRoles: wfEscRoles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          maxDelegationDepth: wfMaxDepth,
        }),
      });
      setMessage(t('workflowPolicySaved'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadPolicyHistory() {
    await withFeedback(async () => {
      const data = await apiRequest<WorkflowPolicyHistoryResponse>(
        `/v1/workflows/policies/${wfType}/history`,
      );
      setWfHistory(data);
      setMessage(t('historyLoaded'));
    }).catch((cause: unknown) => {
      setWfHistory(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadTimeThresholds() {
    await withFeedback(async () => {
      const data = await apiRequest<TimeThresholds>('/v1/time-thresholds');
      setDailyMax(data.dailyMaxMinutes);
      setMinRest(data.minRestMinutes);
      setMessage(t('timeThresholdsLoaded'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function saveTimeThresholds() {
    await withFeedback(async () => {
      await apiRequest('/v1/time-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyMaxMinutes: dailyMax, minRestMinutes: minRest }),
      });
      setMessage(t('timeThresholdsSaved'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
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

      <StatusBanner message={message} error={error} />

      {/* Workflow policy editor */}
      <SectionCard>
        <h2>{t('workflowPolicyTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('workflowTypeLabel')}</span>
            <select value={wfType} onChange={(e) => setWfType(e.target.value)}>
              {WORKFLOW_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <div className="cq-flex-end">
            <button type="button" disabled={loading} onClick={() => void loadWorkflowPolicy()}>
              {loading ? t('loading') : t('loadWorkflowPolicy')}
            </button>
          </div>
        </div>
        <div className="cq-grid-2 cq-space-top-sm">
          <label className="cq-form-field">
            <span>{t('escalationDeadlineHoursLabel')}</span>
            <input
              type="number"
              min={1}
              value={wfEscDeadline}
              onChange={(e) => setWfEscDeadline(Number(e.target.value))}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('escalationRolesLabel')}</span>
            <input value={wfEscRoles} onChange={(e) => setWfEscRoles(e.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('maxDelegationDepthLabel')}</span>
            <input
              type="number"
              min={1}
              max={10}
              value={wfMaxDepth}
              onChange={(e) => setWfMaxDepth(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="cq-flex-end cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void saveWorkflowPolicy()}>
            {loading ? t('loading') : t('saveWorkflowPolicy')}
          </button>
        </div>
      </SectionCard>

      {/* Workflow policy version history */}
      <SectionCard>
        <h2>{t('policyHistoryTitle')}</h2>
        <div className="cq-flex-end">
          <button type="button" disabled={loading} onClick={() => void loadPolicyHistory()}>
            {loading ? t('loading') : t('loadHistory')}
          </button>
        </div>
        {wfHistory ? (
          <ul className="cq-list-stack cq-space-top-sm">
            {wfHistory.entries.map((entry) => (
              <li key={entry.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={entry.type} variant="info" label={entry.type} />
                    {entry.activeTo ? null : (
                      <StatusBadge status="ACTIVE" variant="ok" label="active" />
                    )}
                  </div>
                </div>
                <div className="cq-list-item-meta">
                  <span>
                    {t('activeFrom')}: {entry.activeFrom}
                  </span>
                  {entry.activeTo && (
                    <>
                      <span>&middot;</span>
                      <span>
                        {t('activeTo')}: {entry.activeTo}
                      </span>
                    </>
                  )}
                  <span>&middot;</span>
                  <span>escalation: {entry.escalationDeadlineHours}h</span>
                  <span>&middot;</span>
                  <span>max depth: {entry.maxDelegationDepth}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cq-space-top-sm">{t('noHistory')}</p>
        )}
      </SectionCard>

      {/* ArbZG time thresholds editor */}
      <SectionCard>
        <h2>{t('timeThresholdsTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('dailyMaxMinutesLabel')}</span>
            <input
              type="number"
              min={60}
              max={720}
              value={dailyMax}
              onChange={(e) => setDailyMax(Number(e.target.value))}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('minRestMinutesLabel')}</span>
            <input
              type="number"
              min={60}
              max={1440}
              value={minRest}
              onChange={(e) => setMinRest(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="cq-flex-end cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void loadTimeThresholds()}>
            {loading ? t('loading') : t('loadTimeThresholds')}
          </button>
          <button type="button" disabled={loading} onClick={() => void saveTimeThresholds()}>
            {loading ? t('loading') : t('saveTimeThresholds')}
          </button>
        </div>
      </SectionCard>

      {/* Legacy bundle view */}
      <SectionCard>
        <h2>{t('bundleTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('asOfLabel')}</span>
            <input value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <div className="cq-flex-end">
            <button type="button" disabled={loading} onClick={() => void loadBundle()}>
              {loading ? t('loading') : t('loadBundle')}
            </button>
          </div>
        </div>

        {bundle ? (
          <ul className="cq-list-stack cq-space-top-sm">
            {bundle.policies.map((entry) => (
              <li key={entry.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={entry.type} variant="info" label={entry.type} />
                    <strong>{entry.name}</strong>
                    <StatusBadge status={`v${entry.version}`} variant="muted" />
                  </div>
                </div>
                <div className="cq-list-item-meta">
                  <span>
                    {t('effectiveFrom')}: {entry.effectiveFrom}
                  </span>
                  <span>&middot;</span>
                  <span>
                    {t('effectiveTo')}: {entry.effectiveTo ?? '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cq-space-top-sm">{t('noBundle')}</p>
        )}
      </SectionCard>
    </PageShell>
  );
}
