'use client';

/** Closing-period display sections with role-aware UX; backend closing controls remain authoritative. */

import Link from 'next/link';
import type { useTranslations } from 'next-intl';
import type { CueqRole } from '../../../components/AppWorkspace';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import {
  canManageClosingPeriod,
  createClosingActionDescriptors,
  hasHrClosingAuthority,
  type ClosingActionDescriptor,
  type ClosingActionId,
} from './closing-action-policy';

interface ClosingChecklistItem {
  code: string;
  label: string;
  severity: string;
  status: string;
  details: string;
}

export interface ClosingChecklistResponse {
  closingPeriodId: string;
  status: string;
  hasErrors: boolean;
  items: ClosingChecklistItem[];
}

interface ExportRun {
  id: string;
  format: string;
  recordCount: number;
  checksum: string;
  exportedAt: string;
}

export interface ClosingPeriod {
  id: string;
  organizationUnitId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  exportRuns: ExportRun[];
  leadApprovedAt?: string | null;
  leadApprovedById?: string | null;
  hrApprovedAt?: string | null;
  hrApprovedById?: string | null;
  lockedAt?: string | null;
  lockSource?: string | null;
}

export interface ApplyCorrectionPayload {
  workflowId: string;
  personId: string;
  timeTypeId: string;
  startTime: string;
  endTime: string;
  reason: string;
  note?: string;
}

type TranslationFn = ReturnType<typeof useTranslations>;

function checklistVariant(item: ClosingChecklistItem): 'ok' | 'error' | 'warn' | 'muted' {
  if (item.severity === 'ERROR' || item.status === 'FAIL') return 'error';
  if (item.severity === 'WARNING') return 'warn';
  if (item.status === 'OK' || item.status === 'PASS') return 'ok';
  return 'muted';
}

function formatInstant(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(instant);
}

function formatMonth(value: string, locale: string): string {
  const instant = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(instant);
}

function compactIdentifier(value: string): string {
  return value.length > 18 ? `…${value.slice(-14)}` : value;
}

/** Resolves the selected period from the latest list while preferring refreshed detail. */
export function findSelectedPeriod(
  periods: ClosingPeriod[],
  selectedPeriodId: string | null,
  detail: ClosingPeriod | null,
): ClosingPeriod | null {
  if (!selectedPeriodId) return null;
  return periods.find((period) => period.id === selectedPeriodId) ?? detail;
}

/** Returns checklist totals used by the readiness strip. */
function closingChecklistTotals(checklist: ClosingChecklistResponse | null) {
  const items = checklist?.items ?? [];
  const passed = items.filter((item) => checklistVariant(item) === 'ok').length;
  const attention = items.filter((item) => {
    const variant = checklistVariant(item);
    return variant === 'warn' || variant === 'error';
  }).length;
  return { total: items.length, passed, attention };
}

/** Renders period and organization scope controls in the page header. */
export function PeriodQuerySection({
  t,
  locale,
  fromMonth,
  toMonth,
  organizationUnitId,
  selectedOrganizationUnitId,
  loading,
  onFromMonthChange,
  onToMonthChange,
  onOrganizationUnitChange,
  onLoadPeriods,
  organizationUnitLocked = false,
}: {
  t: TranslationFn;
  locale: string;
  fromMonth: string;
  toMonth: string;
  organizationUnitId: string;
  selectedOrganizationUnitId?: string | null;
  loading: boolean;
  onFromMonthChange: (value: string) => void;
  onToMonthChange: (value: string) => void;
  onOrganizationUnitChange: (value: string) => void;
  onLoadPeriods: () => void;
  organizationUnitLocked?: boolean;
}) {
  const organizationScope = organizationUnitId || selectedOrganizationUnitId || '';
  return (
    <div className="cq-closing-scope" aria-label={t('periodQueryTitle')}>
      <label className="cq-closing-scope-field">
        <span className="cq-sr-only">{t('fromMonth')}</span>
        <span className="cq-closing-scope-icon" aria-hidden="true">
          ▣
        </span>
        <input
          type="month"
          value={fromMonth}
          aria-label={t('fromMonth')}
          onChange={(event) => onFromMonthChange(event.target.value)}
        />
        <span className="cq-closing-scope-value" aria-hidden="true">
          {formatMonth(fromMonth, locale)}
        </span>
      </label>
      {toMonth !== fromMonth ? (
        <label className="cq-closing-scope-field">
          <span className="cq-sr-only">{t('toMonth')}</span>
          <input
            type="month"
            value={toMonth}
            aria-label={t('toMonth')}
            onChange={(event) => onToMonthChange(event.target.value)}
          />
        </label>
      ) : null}
      <label className="cq-closing-scope-field cq-closing-scope-field-wide">
        <span className="cq-closing-scope-icon" aria-hidden="true">
          ◇
        </span>
        <span>{t('organizationUnitShort')}</span>
        <input
          value={organizationUnitId}
          aria-label={t('organizationUnitId')}
          title={organizationScope || t('organizationUnitAll')}
          placeholder={
            organizationScope ? compactIdentifier(organizationScope) : t('organizationUnitAll')
          }
          disabled={organizationUnitLocked}
          onChange={(event) => onOrganizationUnitChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="cq-btn-secondary cq-btn-sm"
        aria-label={t('loadPeriods')}
        disabled={loading}
        onClick={onLoadPeriods}
      >
        {loading ? t('loading') : t('refresh')}
      </button>
    </div>
  );
}

/** Keeps multi-period selection available without adding a permanent card for the common single result. */
export function PeriodListSection({
  t,
  locale,
  periods,
  selectedPeriod,
  loading,
  onSelectPeriod,
}: {
  t: TranslationFn;
  locale: string;
  periods: ClosingPeriod[];
  selectedPeriod: ClosingPeriod | null;
  loading: boolean;
  onSelectPeriod: (periodId: string) => void;
}) {
  if (periods.length === 1) return null;

  return (
    <SectionCard className="cq-closing-periods">
      <h2>{t('periodListTitle')}</h2>
      {periods.length === 0 ? (
        <p className="cq-text-muted">{t('noPeriods')}</p>
      ) : (
        <div className="cq-closing-period-tabs">
          {periods.map((row) => (
            <button
              key={row.id}
              type="button"
              className="cq-btn-secondary"
              data-active={row.id === selectedPeriod?.id || undefined}
              disabled={loading}
              onClick={() => onSelectPeriod(row.id)}
            >
              {formatMonth(row.periodStart, locale)}
              <StatusBadge status={row.status} />
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Renders the shared-border readiness strip from selected-period state. */
export function PeriodStateSection({
  t,
  period,
  checklist,
}: {
  t: TranslationFn;
  period: ClosingPeriod | null;
  checklist: ClosingChecklistResponse | null;
}) {
  if (!period) return null;
  const totals = closingChecklistTotals(checklist);

  return (
    <SectionCard className="cq-closing-metrics">
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ✓
        </span>
        <span>
          <small>{t('stateLabel')}</small>
          <strong className="cq-accent-text">{period.status}</strong>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ≡
        </span>
        <span>
          <strong>
            {totals.passed} / {totals.total}
          </strong>
          <small>{t('checks')}</small>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ◎
        </span>
        <span>
          <small>{t('leadApprovalLabel')}</small>
          <strong className={period.leadApprovedAt ? 'cq-ok' : 'cq-text-muted'}>
            {period.leadApprovedAt ? t('granted') : t('pending')}
          </strong>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon cq-closing-metric-icon-warn" aria-hidden="true">
          !
        </span>
        <span>
          <strong>{totals.attention}</strong>
          <small>{t('openFindings')}</small>
        </span>
      </div>
    </SectionCard>
  );
}

interface ActionsSectionProps {
  t: TranslationFn;
  locale: string;
  loading: boolean;
  period: ClosingPeriod | null;
  exportFormat: 'CSV_V1' | 'XML_V1';
  workflowReason: string;
  onExportFormatChange: (format: 'CSV_V1' | 'XML_V1') => void;
  onRunPeriodAction: (pathSuffix: ClosingActionId, body?: unknown) => void;
  role: CueqRole | null;
  checklist: ClosingChecklistResponse | null;
}

function preferredAction(actions: ClosingActionDescriptor[], period: ClosingPeriod | null) {
  const preferredByStatus: Record<string, ClosingActionId> = {
    REVIEW: actions.some((action) => action.id === 'lead-approve') ? 'lead-approve' : 'approve',
    APPROVED: 'export',
    CLOSED: 'export',
    EXPORTED: 'post-close-corrections',
  };
  return (
    actions.find((action) => action.id === preferredByStatus[period?.status ?? '']) ?? actions[0]
  );
}

function ClosingPrimaryAction({
  t,
  action,
  loading,
  onRunPeriodAction,
}: {
  t: TranslationFn;
  action: ClosingActionDescriptor | undefined;
  loading: boolean;
  onRunPeriodAction: ActionsSectionProps['onRunPeriodAction'];
}) {
  if (!action) return null;
  return (
    <>
      <button
        type="button"
        className="cq-closing-primary-action"
        disabled={loading || !action.available}
        aria-describedby={action.available ? undefined : action.unavailableHintId}
        onClick={() => onRunPeriodAction(action.id, action.body)}
      >
        <span aria-hidden="true">{action.available ? '✓' : '▣'}</span>
        {t(action.label)}
      </button>
      {action.available ? null : (
        <p id={action.unavailableHintId} className="cq-closing-action-reason">
          <span aria-hidden="true">!</span>
          {t(action.unavailableHint)}
        </p>
      )}
    </>
  );
}

/** Renders the sticky decision rail, including explicit prerequisite reasons. */
export function ActionsSection(props: ActionsSectionProps) {
  if (!canManageClosingPeriod(props.role) || !props.period) return null;

  const actions = createClosingActionDescriptors(props);
  const primary = preferredAction(actions, props.period);
  const reopen = actions.find((action) => action.id === 'reopen');
  const showExportFormat = hasHrClosingAuthority(props.role) && primary?.id === 'export';

  return (
    <SectionCard className="cq-closing-decision">
      <h2>{props.t('actionsTitle')}</h2>
      <p>{props.t('nextStepBody')}</p>
      {showExportFormat ? (
        <label className="cq-form-field cq-closing-format">
          <span>{props.t('exportFormatLabel')}</span>
          <select
            value={props.exportFormat}
            onChange={(event) =>
              props.onExportFormatChange(event.target.value as 'CSV_V1' | 'XML_V1')
            }
          >
            <option value="CSV_V1">CSV_V1</option>
            <option value="XML_V1">XML_V1</option>
          </select>
        </label>
      ) : null}
      <ClosingPrimaryAction
        t={props.t}
        action={primary}
        loading={props.loading}
        onRunPeriodAction={props.onRunPeriodAction}
      />
      {reopen && reopen.id !== primary?.id ? (
        <button
          type="button"
          className="cq-btn-secondary cq-closing-secondary-action"
          disabled={props.loading || !reopen.available}
          aria-describedby={reopen.available ? undefined : reopen.unavailableHintId}
          onClick={() => props.onRunPeriodAction(reopen.id, reopen.body)}
        >
          <span aria-hidden="true">↻</span>
          {props.t(reopen.label)}
        </button>
      ) : null}
      <Link className="cq-closing-audit-link" href={`/${props.locale}/audit`}>
        {props.t('viewAudit')}
      </Link>
      <div className="cq-closing-privacy">
        <h3>{props.t('privacyTitle')}</h3>
        <p>{props.t('privacyBody')}</p>
      </div>
    </SectionCard>
  );
}

/** Renders checklist evidence as compact, comparable operational rows. */
export function ChecklistSection({
  t,
  checklist,
}: {
  t: TranslationFn;
  checklist: ClosingChecklistResponse | null;
}) {
  return (
    <SectionCard className="cq-closing-checklist">
      <h2>{t('checklistTitle')}</h2>
      {!checklist ? (
        <p className="cq-text-muted">{t('noChecklist')}</p>
      ) : (
        <ol className="cq-closing-checklist-list">
          {checklist.items.map((item, index) => {
            const variant = checklistVariant(item);
            const statusLabel =
              variant === 'ok' ? t('fulfilled') : variant === 'muted' ? t('waiting') : t('review');
            return (
              <li key={item.code} data-variant={variant}>
                <span className="cq-closing-check-icon" aria-hidden="true">
                  {variant === 'ok' ? '✓' : variant === 'error' || variant === 'warn' ? '!' : '…'}
                </span>
                <strong data-index={`${index + 1}.`}>{item.label}</strong>
                <StatusBadge status={item.status} variant={variant} label={statusLabel} />
                <p>{item.details}</p>
                <span className="cq-closing-row-chevron" aria-hidden="true">
                  ›
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

/** Renders the selected period's approval chain as a compact evidence timeline. */
export function ApprovalChainSection({
  t,
  locale,
  period,
}: {
  t: TranslationFn;
  locale: string;
  period: ClosingPeriod | null;
}) {
  if (!period) return null;
  return (
    <SectionCard className="cq-closing-evidence-card cq-closing-approval-chain">
      <h2>{t('approvalChainTitle')}</h2>
      <ol>
        <li data-complete={Boolean(period.leadApprovedAt) || undefined}>
          <span aria-hidden="true">{period.leadApprovedAt ? '✓' : ''}</span>
          <div>
            <strong>{t('teamLead')}</strong>
            <p>{period.leadApprovedAt ? t('leadGranted') : t('leadPending')}</p>
            {period.leadApprovedAt ? (
              <small>{formatInstant(period.leadApprovedAt, locale)}</small>
            ) : null}
          </div>
          <StatusBadge
            status={period.leadApprovedAt ? 'COMPLETED' : 'PENDING'}
            label={period.leadApprovedAt ? t('completed') : t('pending')}
          />
        </li>
        <li data-complete={Boolean(period.hrApprovedAt) || undefined}>
          <span aria-hidden="true">{period.hrApprovedAt ? '✓' : ''}</span>
          <div>
            <strong>{t('humanResources')}</strong>
            <p>{period.hrApprovedAt ? t('hrGranted') : t('hrPending')}</p>
            {period.hrApprovedAt ? (
              <small>{formatInstant(period.hrApprovedAt, locale)}</small>
            ) : (
              <small className="cq-warn">{t('nextStep')}</small>
            )}
          </div>
          <StatusBadge
            status={period.hrApprovedAt ? 'COMPLETED' : 'PENDING'}
            label={period.hrApprovedAt ? t('completed') : t('pending')}
          />
        </li>
      </ol>
    </SectionCard>
  );
}

interface CorrectionSectionProps {
  t: TranslationFn;
  loading: boolean;
  period: ClosingPeriod | null;
  workflowId: string;
  workflowReason: string;
  correctionPayload: ApplyCorrectionPayload;
  onWorkflowIdChange: (value: string) => void;
  onWorkflowReasonChange: (value: string) => void;
  onCorrectionPayloadChange: (payload: ApplyCorrectionPayload) => void;
  onApproveWorkflow: () => void;
  onApplyCorrection: () => void;
  role: CueqRole | null;
  workflowApproved: boolean;
}

function CorrectionPayloadFields({ form }: { form: CorrectionSectionProps }) {
  const updatePayload = (change: Partial<ApplyCorrectionPayload>) =>
    form.onCorrectionPayloadChange({ ...form.correctionPayload, ...change });

  return (
    <div className="cq-grid-2">
      <label className="cq-form-field">
        <span>{form.t('personIdLabel')}</span>
        <input
          value={form.correctionPayload.personId}
          onChange={(event) => updatePayload({ personId: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{form.t('timeTypeIdLabel')}</span>
        <input
          value={form.correctionPayload.timeTypeId}
          onChange={(event) => updatePayload({ timeTypeId: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{form.t('startTimeLabel')}</span>
        <input
          value={form.correctionPayload.startTime}
          onChange={(event) => updatePayload({ startTime: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{form.t('endTimeLabel')}</span>
        <input
          value={form.correctionPayload.endTime}
          onChange={(event) => updatePayload({ endTime: event.target.value })}
        />
      </label>
      <label className="cq-form-field cq-full-span">
        <span>{form.t('reasonLabel')}</span>
        <input
          value={form.correctionPayload.reason}
          onChange={(event) => updatePayload({ reason: event.target.value })}
        />
      </label>
    </div>
  );
}

/** Keeps post-close correction tools available without competing with the current decision. */
export function CorrectionSection(props: CorrectionSectionProps) {
  if (props.role !== 'HR' && props.role !== 'ADMIN') return null;
  const canApproveWorkflow = props.period?.status === 'REVIEW' && Boolean(props.workflowId);
  const canApplyCorrection = props.period?.status === 'REVIEW' && props.workflowApproved;

  return (
    <details className="cq-closing-correction">
      <summary>{props.t('postCloseTools')}</summary>
      <SectionCard>
        <h2>{props.t('correctionTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{props.t('workflowIdLabel')}</span>
            <input
              value={props.workflowId}
              onChange={(event) => props.onWorkflowIdChange(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{props.t('workflowReasonLabel')}</span>
            <input
              value={props.workflowReason}
              onChange={(event) => props.onWorkflowReasonChange(event.target.value)}
            />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button
            type="button"
            disabled={props.loading || !canApproveWorkflow}
            aria-describedby={!canApproveWorkflow ? 'closing-workflow-reason' : undefined}
            onClick={props.onApproveWorkflow}
          >
            {props.t('approveWorkflow')}
          </button>
        </div>
        {!canApproveWorkflow ? (
          <p id="closing-workflow-reason" className="cq-form-hint">
            {props.t('workflowApprovalUnavailable')}
          </p>
        ) : null}
        <hr className="cq-separator" />
        <CorrectionPayloadFields form={props} />
        <div className="cq-space-top-sm">
          <button
            type="button"
            disabled={props.loading || !canApplyCorrection}
            aria-describedby={!canApplyCorrection ? 'closing-apply-correction-reason' : undefined}
            onClick={props.onApplyCorrection}
          >
            {props.t('applyCorrection')}
          </button>
        </div>
        {!canApplyCorrection ? (
          <p id="closing-apply-correction-reason" className="cq-form-hint">
            {props.t('applyCorrectionUnavailable')}
          </p>
        ) : null}
      </SectionCard>
    </details>
  );
}

/** Renders the latest export as a compact evidence card with provenance. */
export function ExportsSection({
  t,
  locale,
  loading,
  period,
  onDownloadArtifact,
}: {
  t: TranslationFn;
  locale: string;
  loading: boolean;
  period: ClosingPeriod | null;
  onDownloadArtifact: (runId: string) => void;
}) {
  if (!period) return null;
  const latestRun = period.exportRuns[0];
  return (
    <SectionCard className="cq-closing-evidence-card cq-closing-export">
      <h2>{t('exportsTitle')}</h2>
      {!latestRun ? (
        <>
          <strong>
            {t('noExportForPeriod', { month: formatMonth(period.periodStart, locale) })}
          </strong>
          <dl>
            <dt>{t('checksum')}</dt>
            <dd>-</dd>
          </dl>
        </>
      ) : (
        <>
          <div className="cq-closing-export-heading">
            <strong>{latestRun.format}</strong>
            <StatusBadge status="COMPLETED" label={t('completed')} />
          </div>
          <p>
            {formatInstant(latestRun.exportedAt, locale)} ·{' '}
            {t('recordCount', { count: latestRun.recordCount })}
          </p>
          <dl>
            <dt>{t('checksum')}</dt>
            <dd className="cq-mono">{latestRun.checksum}</dd>
          </dl>
          <button
            type="button"
            className="cq-btn-secondary cq-btn-sm"
            disabled={loading}
            onClick={() => onDownloadArtifact(latestRun.id)}
          >
            {t('downloadArtifact')}
          </button>
        </>
      )}
      <div className="cq-closing-export-note">
        <strong>{t('auditNote')}</strong>
        <p>{t('exportAuditNote')}</p>
      </div>
    </SectionCard>
  );
}
