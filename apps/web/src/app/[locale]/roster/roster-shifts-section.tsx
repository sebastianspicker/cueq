'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { isoInstantToLocalDateTimeInput } from '../../../shared/time/datetime-local';
import type { RosterDetail } from './roster-types';

type TranslationFn = ReturnType<typeof useTranslations>;
type RosterShift = RosterDetail['shifts'][number];

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
