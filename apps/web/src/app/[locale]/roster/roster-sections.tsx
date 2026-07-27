'use client';

/** Presentational roster planning sections for commands, shifts, assignments, and plan-versus-actual data. */

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { isoInstantToLocalDateTimeInput } from '../../../lib/datetime-local';

interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface RosterAssignment {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
}

interface RosterShift {
  id: string;
  rosterId: string;
  personId: string | null;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignments: RosterAssignment[];
}

export interface RosterDetail {
  id: string;
  organizationUnitId: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  publishedAt: string | null;
  shifts: RosterShift[];
  members: RosterMember[];
}

interface PlanVsActualSlot {
  shiftId: string;
  minStaffing: number;
  assignedHeadcount: number;
  plannedHeadcount: number;
  actualHeadcount: number;
  delta: number;
  compliant: boolean;
}

export interface PlanVsActual {
  rosterId: string;
  totalSlots: number;
  mismatchedSlots: number;
  complianceRate: number;
  understaffedSlots: number;
  coverageRate: number;
  slots: PlanVsActualSlot[];
}

type TranslationFn = ReturnType<typeof useTranslations>;

/** Renders roster lifecycle controls without acting as an authorization boundary. */
export function RosterCommandBar({
  t,
  loading,
  roster,
  onLoadCurrentRoster,
  onCreateDraftRoster,
  onPublishRoster,
  canManage,
}: {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  onLoadCurrentRoster: () => void;
  onCreateDraftRoster: () => void;
  onPublishRoster: () => void;
  canManage: boolean;
}) {
  const canPublish = canManage && roster?.status === 'DRAFT';
  return (
    <div className="cq-inline-actions">
      <button type="button" disabled={loading} onClick={onLoadCurrentRoster}>
        {loading ? t('loading') : t('loadCurrent')}
      </button>
      {canManage ? (
        <>
          <button type="button" disabled={loading} onClick={onCreateDraftRoster}>
            {t('createDraft')}
          </button>
          <button
            type="button"
            disabled={loading || !canPublish}
            aria-describedby={!canPublish ? 'roster-publish-reason' : undefined}
            onClick={onPublishRoster}
          >
            {t('publish')}
          </button>
        </>
      ) : null}
      {canManage && !canPublish ? (
        <span id="roster-publish-reason" className="cq-form-hint">
          {t('draftActionsUnavailable')}
        </span>
      ) : null}
    </div>
  );
}

/** Renders summary data for the currently selected roster. */
export function RosterDetailSection({
  t,
  roster,
}: {
  t: TranslationFn;
  roster: RosterDetail | null;
}) {
  if (!roster) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('rosterDetail')}</h2>
      <dl className="cq-kv-grid">
        <dt>{t('status')}</dt>
        <dd>
          <StatusBadge status={roster.status} />
        </dd>
        <dt>{t('period')}</dt>
        <dd>
          {roster.periodStart} &ndash; {roster.periodEnd}
        </dd>
      </dl>
    </SectionCard>
  );
}

/** Renders form controls for beginning a draft roster. */
export function DraftRosterSection({
  t,
  draftOrganizationUnitId,
  draftPeriodStart,
  draftPeriodEnd,
  onDraftOrganizationUnitIdChange,
  onDraftPeriodStartChange,
  onDraftPeriodEndChange,
  canManage,
}: {
  t: TranslationFn;
  draftOrganizationUnitId: string;
  draftPeriodStart: string;
  draftPeriodEnd: string;
  onDraftOrganizationUnitIdChange: (value: string) => void;
  onDraftPeriodStartChange: (value: string) => void;
  onDraftPeriodEndChange: (value: string) => void;
  canManage: boolean;
}) {
  if (!canManage) {
    return null;
  }
  return (
    <SectionCard>
      <h2>{t('createDraft')}</h2>
      <div className="cq-grid-3">
        <label className="cq-form-field">
          <span>{t('organizationUnitId')}</span>
          <input
            value={draftOrganizationUnitId}
            onChange={(event) => onDraftOrganizationUnitIdChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('periodStart')}</span>
          <input
            type="datetime-local"
            value={draftPeriodStart}
            onChange={(event) => onDraftPeriodStartChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('periodEnd')}</span>
          <input
            type="datetime-local"
            value={draftPeriodEnd}
            onChange={(event) => onDraftPeriodEndChange(event.target.value)}
          />
        </label>
      </div>
    </SectionCard>
  );
}

interface CreateShiftSectionProps {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  shiftStart: string;
  shiftEnd: string;
  shiftType: string;
  minStaffing: number;
  onShiftStartChange: (value: string) => void;
  onShiftEndChange: (value: string) => void;
  onShiftTypeChange: (value: string) => void;
  onMinStaffingChange: (value: number) => void;
  onCreateShift: () => void;
  canEdit: boolean;
}

/** Renders fields used to create a shift in the selected roster. */
export function CreateShiftSection(props: CreateShiftSectionProps) {
  const {
    t,
    loading,
    roster,
    shiftStart,
    shiftEnd,
    shiftType,
    minStaffing,
    onShiftStartChange,
    onShiftEndChange,
    onShiftTypeChange,
    onMinStaffingChange,
    onCreateShift,
    canEdit,
  } = props;
  if (!canEdit) {
    return null;
  }
  return (
    <SectionCard>
      <h2>{t('createShift')}</h2>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('startTime')}</span>
          <input
            type="datetime-local"
            value={shiftStart}
            onChange={(event) => onShiftStartChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('endTime')}</span>
          <input
            type="datetime-local"
            value={shiftEnd}
            onChange={(event) => onShiftEndChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('shiftType')}</span>
          <input value={shiftType} onChange={(event) => onShiftTypeChange(event.target.value)} />
        </label>

        <label className="cq-form-field">
          <span>{t('minStaffing')}</span>
          <input
            type="number"
            min={1}
            value={minStaffing}
            onChange={(event) => onMinStaffingChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="cq-space-top-sm">
        <button type="button" disabled={loading || !roster} onClick={onCreateShift}>
          {t('create')}
        </button>
      </div>
    </SectionCard>
  );
}

/** Renders shifts and assignment controls for the selected roster. */
export function ShiftsSection({
  t,
  loading,
  roster,
  assignSelection,
  onAssignSelectionChange,
  onAssignShift,
  onUnassignShift,
  canEdit,
}: {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  assignSelection: Record<string, string>;
  onAssignSelectionChange: (shiftId: string, personId: string) => void;
  onAssignShift: (shiftId: string) => void;
  onUnassignShift: (shiftId: string, assignmentId: string) => void;
  canEdit: boolean;
}) {
  return (
    <SectionCard>
      <h2>{t('shifts')}</h2>
      {!roster || roster.shifts.length === 0 ? (
        <p>{t('noShifts')}</p>
      ) : (
        <ul className="cq-list-stack">
          {roster.shifts.map((shift) => (
            <ShiftRow
              key={shift.id}
              t={t}
              loading={loading}
              roster={roster}
              shift={shift}
              selectedPerson={assignSelection[shift.id] ?? roster.members[0]?.id ?? ''}
              canEdit={canEdit}
              onAssignSelectionChange={onAssignSelectionChange}
              onAssignShift={onAssignShift}
              onUnassignShift={onUnassignShift}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

interface ShiftRowProps {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail;
  shift: RosterShift;
  selectedPerson: string;
  canEdit: boolean;
  onAssignSelectionChange: (shiftId: string, personId: string) => void;
  onAssignShift: (shiftId: string) => void;
  onUnassignShift: (shiftId: string, assignmentId: string) => void;
}

function ShiftRow(props: ShiftRowProps) {
  const { t, shift, canEdit } = props;
  const isUnderstaffed = shift.assignments.length < shift.minStaffing;
  return (
    <li className="cq-list-item">
      <div className="cq-list-item-header">
        <div className="cq-list-item-meta">
          <StatusBadge status={shift.shiftType} variant="info" />
          <span>
            {isoInstantToLocalDateTimeInput(shift.startTime)} &ndash;{' '}
            {isoInstantToLocalDateTimeInput(shift.endTime)}
          </span>
        </div>
        <div className="cq-list-item-meta">
          <span
            className={
              isUnderstaffed ? 'cq-status-dot cq-status-dot-warn' : 'cq-status-dot cq-status-dot-ok'
            }
          />
          <span>
            {t('assigned')}: {shift.assignments.length} / {shift.minStaffing}
          </span>
        </div>
      </div>
      {isUnderstaffed ? <div className="cq-status-warning">{t('minStaffingWarning')}</div> : null}
      {canEdit ? <ShiftAssignmentControls row={props} /> : null}
      {shift.assignments.length > 0 ? <AssignmentList row={props} /> : null}
    </li>
  );
}

function ShiftAssignmentControls({ row }: { row: ShiftRowProps }) {
  return (
    <div className="cq-flex-center cq-space-top-xs">
      <select
        aria-label={row.t('assignPersonLabel')}
        value={row.selectedPerson}
        onChange={(event) => row.onAssignSelectionChange(row.shift.id, event.target.value)}
      >
        {row.roster.members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.firstName} {member.lastName}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="cq-btn-sm"
        disabled={row.loading}
        onClick={() => row.onAssignShift(row.shift.id)}
      >
        {row.t('assign')}
      </button>
    </div>
  );
}

function AssignmentList({ row }: { row: ShiftRowProps }) {
  return (
    <ul className="cq-space-top-xs">
      {row.shift.assignments.map((assignment) => (
        <li key={assignment.id} className="cq-list-item-meta">
          <span>
            {assignment.firstName} {assignment.lastName}
          </span>
          {row.canEdit ? (
            <button
              type="button"
              className="cq-btn-ghost cq-btn-sm"
              aria-label={`${row.t('removeAssignment')}: ${assignment.firstName} ${assignment.lastName}`}
              disabled={row.loading}
              onClick={() => row.onUnassignShift(row.shift.id, assignment.id)}
            >
              {row.t('remove')}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface ShiftSwapSectionProps {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  swapShiftId: string;
  swapFromPersonId: string;
  swapToPersonId: string;
  swapReason: string;
  onSwapShiftIdChange: (value: string) => void;
  onSwapFromPersonIdChange: (value: string) => void;
  onSwapToPersonIdChange: (value: string) => void;
  onSwapReasonChange: (value: string) => void;
  onRequestShiftSwap: () => void;
}

/** Renders a shift-swap workflow request form. */
export function ShiftSwapSection(props: ShiftSwapSectionProps) {
  const {
    t,
    loading,
    roster,
    swapShiftId,
    swapFromPersonId,
    swapToPersonId,
    swapReason,
    onSwapShiftIdChange,
    onSwapFromPersonIdChange,
    onSwapToPersonIdChange,
    onSwapReasonChange,
    onRequestShiftSwap,
  } = props;
  return (
    <SectionCard>
      <h2>{t('swapTitle')}</h2>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('swapShiftId')}</span>
          <input
            value={swapShiftId}
            onChange={(event) => onSwapShiftIdChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('swapFromPersonId')}</span>
          <input
            value={swapFromPersonId}
            onChange={(event) => onSwapFromPersonIdChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('swapToPersonId')}</span>
          <input
            value={swapToPersonId}
            onChange={(event) => onSwapToPersonIdChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('swapReason')}</span>
          <input value={swapReason} onChange={(event) => onSwapReasonChange(event.target.value)} />
        </label>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading || !roster} onClick={onRequestShiftSwap}>
          {t('swapRequest')}
        </button>
      </div>
    </SectionCard>
  );
}

/** Renders plan-versus-actual comparison data returned by the API. */
export function PlanVsActualSection({
  t,
  planVsActual,
}: {
  t: TranslationFn;
  planVsActual: PlanVsActual | null;
}) {
  return (
    <SectionCard>
      <h2>{t('planVsActual')}</h2>
      {!planVsActual ? (
        <p>{t('noPlanVsActual')}</p>
      ) : (
        <>
          <div className="cq-stat-row">
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('slots')}</span>
              <span className="cq-stat-value">{planVsActual.totalSlots}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('mismatches')}</span>
              <span className="cq-stat-value">{planVsActual.mismatchedSlots}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('understaffed')}</span>
              <span className="cq-stat-value">{planVsActual.understaffedSlots}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('complianceRate')}</span>
              <span className="cq-stat-value">{planVsActual.complianceRate}</span>
              <div className="cq-compliance-bar">
                <div
                  className="cq-compliance-fill"
                  style={{ width: `${Math.min(100, planVsActual.complianceRate * 100)}%` }}
                  data-level={
                    planVsActual.complianceRate < 0.7
                      ? 'error'
                      : planVsActual.complianceRate < 0.9
                        ? 'warn'
                        : undefined
                  }
                />
              </div>
            </div>
          </div>

          <table className="cq-data-table" tabIndex={0}>
            <caption className="cq-sr-only">{t('planVsActualCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('shift')}</th>
                <th scope="col">{t('planned')}</th>
                <th scope="col">{t('actual')}</th>
                <th scope="col">{t('delta')}</th>
                <th scope="col">{t('compliant')}</th>
              </tr>
            </thead>
            <tbody>
              {planVsActual.slots.map((slot) => (
                <tr key={slot.shiftId}>
                  <td className="cq-mono">{slot.shiftId}</td>
                  <td>{slot.plannedHeadcount}</td>
                  <td>{slot.actualHeadcount}</td>
                  <td>{slot.delta}</td>
                  <td>
                    <StatusBadge
                      status={slot.compliant ? 'OK' : 'FAIL'}
                      label={slot.compliant ? t('yes') : t('no')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </SectionCard>
  );
}
