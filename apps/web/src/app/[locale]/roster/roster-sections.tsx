'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface RosterAssignment {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
}

export interface RosterShift {
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

export interface PlanVsActualSlot {
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

type TranslationFn = ReturnType<typeof useTranslations<'pages.roster'>>;

function toLocalDateTimeInput(isoDate: string): string {
  return isoDate.slice(0, 16);
}

export function RosterCommandBar({
  t,
  loading,
  roster,
  onLoadCurrentRoster,
  onCreateDraftRoster,
  onPublishRoster,
}: {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  onLoadCurrentRoster: () => void;
  onCreateDraftRoster: () => void;
  onPublishRoster: () => void;
}) {
  return (
    <div className="cq-inline-actions">
      <button type="button" disabled={loading} onClick={onLoadCurrentRoster}>
        {loading ? t('loading') : t('loadCurrent')}
      </button>
      <button type="button" disabled={loading} onClick={onCreateDraftRoster}>
        {t('createDraft')}
      </button>
      <button type="button" disabled={loading || !roster} onClick={onPublishRoster}>
        {t('publish')}
      </button>
    </div>
  );
}

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

export function DraftRosterSection({
  t,
  draftOrganizationUnitId,
  draftPeriodStart,
  draftPeriodEnd,
  onDraftOrganizationUnitIdChange,
  onDraftPeriodStartChange,
  onDraftPeriodEndChange,
}: {
  t: TranslationFn;
  draftOrganizationUnitId: string;
  draftPeriodStart: string;
  draftPeriodEnd: string;
  onDraftOrganizationUnitIdChange: (value: string) => void;
  onDraftPeriodStartChange: (value: string) => void;
  onDraftPeriodEndChange: (value: string) => void;
}) {
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

export function CreateShiftSection({
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
}: {
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
}) {
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

export function ShiftsSection({
  t,
  loading,
  roster,
  assignSelection,
  onAssignSelectionChange,
  onAssignShift,
  onUnassignShift,
}: {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  assignSelection: Record<string, string>;
  onAssignSelectionChange: (shiftId: string, personId: string) => void;
  onAssignShift: (shiftId: string) => void;
  onUnassignShift: (shiftId: string, assignmentId: string) => void;
}) {
  return (
    <SectionCard>
      <h2>{t('shifts')}</h2>
      {!roster || roster.shifts.length === 0 ? (
        <p>{t('noShifts')}</p>
      ) : (
        <ul className="cq-list-stack">
          {roster.shifts.map((shift) => {
            const isUnderstaffed = shift.assignments.length < shift.minStaffing;
            const defaultCandidate = roster.members[0]?.id ?? '';
            const selectedPerson = assignSelection[shift.id] ?? defaultCandidate;

            return (
              <li key={shift.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={shift.shiftType} variant="info" />
                    <span>
                      {toLocalDateTimeInput(shift.startTime)} &ndash;{' '}
                      {toLocalDateTimeInput(shift.endTime)}
                    </span>
                  </div>
                  <div className="cq-list-item-meta">
                    <span
                      className={
                        isUnderstaffed
                          ? 'cq-status-dot cq-status-dot-warn'
                          : 'cq-status-dot cq-status-dot-ok'
                      }
                    />
                    <span>
                      {t('assigned')}: {shift.assignments.length} / {shift.minStaffing}
                    </span>
                  </div>
                </div>

                {isUnderstaffed ? (
                  <div className="cq-status-warning">{t('minStaffingWarning')}</div>
                ) : null}

                <div className="cq-flex-center cq-space-top-xs">
                  <select
                    aria-label={t('assignPersonLabel')}
                    value={selectedPerson}
                    onChange={(event) => onAssignSelectionChange(shift.id, event.target.value)}
                  >
                    {roster.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cq-btn-sm"
                    disabled={loading}
                    onClick={() => onAssignShift(shift.id)}
                  >
                    {t('assign')}
                  </button>
                </div>

                {shift.assignments.length > 0 ? (
                  <ul className="cq-space-top-xs">
                    {shift.assignments.map((assignment) => (
                      <li key={assignment.id} className="cq-list-item-meta">
                        <span>
                          {assignment.firstName} {assignment.lastName}
                        </span>
                        <button
                          type="button"
                          className="cq-btn-ghost cq-btn-sm"
                          aria-label={`${t('removeAssignment')}: ${assignment.firstName} ${assignment.lastName}`}
                          disabled={loading}
                          onClick={() => onUnassignShift(shift.id, assignment.id)}
                        >
                          {t('remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function ShiftSwapSection({
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
}: {
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
}) {
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

          <table className="cq-data-table">
            <caption className="cq-sr-only">{t('planVsActualCaption')}</caption>
            <thead>
              <tr>
                <th>{t('shift')}</th>
                <th>{t('planned')}</th>
                <th>{t('actual')}</th>
                <th>{t('delta')}</th>
                <th>{t('compliant')}</th>
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
