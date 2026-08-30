'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import type { RosterDetail } from './roster-types';

type TranslationFn = ReturnType<typeof useTranslations>;

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
