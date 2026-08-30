'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import type { PlanVsActual, RosterDetail } from './roster-types';

type TranslationFn = ReturnType<typeof useTranslations>;

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
