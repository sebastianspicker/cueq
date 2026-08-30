import type { PolicyBundle, WorkflowPolicyHistory } from '@cueq/contracts';
import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

const WORKFLOW_TYPES = [
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
  'POST_CLOSE_CORRECTION',
] as const;

type TranslationFn = ReturnType<typeof useTranslations>;

interface WorkflowPolicySectionProps {
  t: TranslationFn;
  loading: boolean;
  wfType: string;
  wfEscDeadline: number;
  wfEscRoles: string;
  wfMaxDepth: number;
  onWfTypeChange: (value: string) => void;
  onWfEscDeadlineChange: (value: number) => void;
  onWfEscRolesChange: (value: string) => void;
  onWfMaxDepthChange: (value: number) => void;
  onLoad: () => void;
  onSave: () => void;
}

export function WorkflowPolicySection({
  t,
  loading,
  wfType,
  wfEscDeadline,
  wfEscRoles,
  wfMaxDepth,
  onWfTypeChange,
  onWfEscDeadlineChange,
  onWfEscRolesChange,
  onWfMaxDepthChange,
  onLoad,
  onSave,
}: WorkflowPolicySectionProps) {
  return (
    <SectionCard>
      <h2>{t('workflowPolicyTitle')}</h2>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('workflowTypeLabel')}</span>
          <select value={wfType} onChange={(event) => onWfTypeChange(event.target.value)}>
            {WORKFLOW_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <div className="cq-flex-end">
          <button type="button" disabled={loading} onClick={onLoad}>
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
            onChange={(event) => onWfEscDeadlineChange(Number(event.target.value))}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('escalationRolesLabel')}</span>
          <input value={wfEscRoles} onChange={(event) => onWfEscRolesChange(event.target.value)} />
        </label>
        <label className="cq-form-field">
          <span>{t('maxDelegationDepthLabel')}</span>
          <input
            type="number"
            min={1}
            max={10}
            value={wfMaxDepth}
            onChange={(event) => onWfMaxDepthChange(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="cq-flex-end cq-space-top-sm">
        <button type="button" disabled={loading} onClick={onSave}>
          {loading ? t('loading') : t('saveWorkflowPolicy')}
        </button>
      </div>
    </SectionCard>
  );
}

interface PolicyHistorySectionProps {
  t: TranslationFn;
  loading: boolean;
  history: WorkflowPolicyHistory | null;
  onLoad: () => void;
}

export function PolicyHistorySection({ t, loading, history, onLoad }: PolicyHistorySectionProps) {
  return (
    <SectionCard>
      <h2>{t('policyHistoryTitle')}</h2>
      <div className="cq-flex-end">
        <button type="button" disabled={loading} onClick={onLoad}>
          {loading ? t('loading') : t('loadHistory')}
        </button>
      </div>
      {history ? (
        <ul className="cq-list-stack cq-space-top-sm">
          {history.entries.map((entry) => (
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
                  <span>
                    {t('activeTo')}: {entry.activeTo}
                  </span>
                )}
                <span>
                  {t('escalationDeadlineHoursLabel')}: {entry.escalationDeadlineHours}h
                </span>
                <span>
                  {t('maxDelegationDepthLabel')}: {entry.maxDelegationDepth}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cq-space-top-sm">{t('noHistory')}</p>
      )}
    </SectionCard>
  );
}

interface TimeThresholdsSectionProps {
  t: TranslationFn;
  loading: boolean;
  dailyMax: number;
  minRest: number;
  onDailyMaxChange: (value: number) => void;
  onMinRestChange: (value: number) => void;
  onLoad: () => void;
  onSave: () => void;
}

export function TimeThresholdsSection({
  t,
  loading,
  dailyMax,
  minRest,
  onDailyMaxChange,
  onMinRestChange,
  onLoad,
  onSave,
}: TimeThresholdsSectionProps) {
  return (
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
            onChange={(event) => onDailyMaxChange(Number(event.target.value))}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('minRestMinutesLabel')}</span>
          <input
            type="number"
            min={60}
            max={1440}
            value={minRest}
            onChange={(event) => onMinRestChange(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="cq-flex-end cq-space-top-sm">
        <button type="button" disabled={loading} onClick={onLoad}>
          {loading ? t('loading') : t('loadTimeThresholds')}
        </button>
        <button type="button" disabled={loading} onClick={onSave}>
          {loading ? t('loading') : t('saveTimeThresholds')}
        </button>
      </div>
    </SectionCard>
  );
}

interface PolicyBundleSectionProps {
  t: TranslationFn;
  loading: boolean;
  asOf: string;
  bundle: PolicyBundle | null;
  onAsOfChange: (value: string) => void;
  onLoad: () => void;
}

export function PolicyBundleSection({
  t,
  loading,
  asOf,
  bundle,
  onAsOfChange,
  onLoad,
}: PolicyBundleSectionProps) {
  return (
    <SectionCard>
      <h2>{t('bundleTitle')}</h2>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('asOfLabel')}</span>
          <input value={asOf} onChange={(event) => onAsOfChange(event.target.value)} />
        </label>
        <div className="cq-flex-end">
          <button type="button" disabled={loading} onClick={onLoad}>
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
                <span>
                  {t('effectiveTo')}: {entry.effectiveTo ?? '-'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cq-space-top-sm">{t('noBundle')}</p>
      )}
    </SectionCard>
  );
}
