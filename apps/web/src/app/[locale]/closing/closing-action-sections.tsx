'use client';

import Link from 'next/link';
import type { CueqRole } from '../../../components/AppWorkspace';
import { SectionCard } from '../../../components/SectionCard';
import {
  canManageClosingPeriod,
  createClosingActionDescriptors,
  hasHrClosingAuthority,
  type ClosingActionDescriptor,
  type ClosingActionId,
} from './closing-action-policy';
import {
  type ApplyCorrectionPayload,
  type ClosingChecklistResponse,
  type ClosingPeriod,
  type TranslationFn,
} from './closing-types';

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
