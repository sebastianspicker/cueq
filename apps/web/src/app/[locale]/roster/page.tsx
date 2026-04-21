'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

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

interface RosterDetail {
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

interface PlanVsActual {
  rosterId: string;
  totalSlots: number;
  mismatchedSlots: number;
  complianceRate: number;
  understaffedSlots: number;
  coverageRate: number;
  slots: PlanVsActualSlot[];
}

function toLocalDateTimeInput(isoDate: string): string {
  return isoDate.slice(0, 16);
}

export default function RosterPage() {
  const t = useTranslations('pages.roster');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const [roster, setRoster] = useState<RosterDetail | null>(null);
  const [planVsActual, setPlanVsActual] = useState<PlanVsActual | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [shiftStart, setShiftStart] = useState('2026-03-11T08:00');
  const [shiftEnd, setShiftEnd] = useState('2026-03-11T16:00');
  const [shiftType, setShiftType] = useState('EARLY');
  const [minStaffing, setMinStaffing] = useState(1);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [draftOrganizationUnitId, setDraftOrganizationUnitId] = useState('');
  const [draftPeriodStart, setDraftPeriodStart] = useState('2026-04-01T00:00');
  const [draftPeriodEnd, setDraftPeriodEnd] = useState('2026-04-30T23:59');
  const [swapShiftId, setSwapShiftId] = useState('');
  const [swapFromPersonId, setSwapFromPersonId] = useState('');
  const [swapToPersonId, setSwapToPersonId] = useState('');
  const [swapReason, setSwapReason] = useState('Please swap assignment for this shift.');

  async function refreshRoster(targetRosterId?: string) {
    const detail = targetRosterId
      ? ((await apiRequest(`/v1/rosters/${targetRosterId}`)) as RosterDetail)
      : ((await apiRequest('/v1/rosters/current')) as RosterDetail);

    setRoster(detail);

    const plan = (await apiRequest(`/v1/rosters/${detail.id}/plan-vs-actual`)) as PlanVsActual;
    setPlanVsActual(plan);

    return detail;
  }

  async function loadCurrentRoster() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const detail = await refreshRoster();
      if (!draftOrganizationUnitId) {
        setDraftOrganizationUnitId(detail.organizationUnitId);
      }
      setMessage(t('loaded'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function createDraftRoster() {
    const organizationUnitId = draftOrganizationUnitId || roster?.organizationUnitId;
    if (!organizationUnitId) {
      setError(t('missingOu'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const created = (await apiRequest('/v1/rosters', {
        method: 'POST',
        body: JSON.stringify({
          organizationUnitId,
          periodStart: new Date(draftPeriodStart).toISOString(),
          periodEnd: new Date(draftPeriodEnd).toISOString(),
        }),
      })) as RosterDetail;

      await refreshRoster(created.id);
      setMessage(t('draftCreated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function createShift() {
    if (!roster) {
      setError(t('loadFirst'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/rosters/${roster.id}/shifts`, {
        method: 'POST',
        body: JSON.stringify({
          startTime: new Date(shiftStart).toISOString(),
          endTime: new Date(shiftEnd).toISOString(),
          shiftType,
          minStaffing,
        }),
      });
      await refreshRoster(roster.id);
      setMessage(t('shiftCreated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function assignShift(shiftId: string) {
    if (!roster) {
      setError(t('loadFirst'));
      return;
    }

    const personId = assignSelection[shiftId] ?? roster.members[0]?.id;
    if (!personId) {
      setError(t('selectPerson'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/rosters/${roster.id}/shifts/${shiftId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ personId }),
      });
      await refreshRoster(roster.id);
      setMessage(t('assignmentCreated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function unassignShift(shiftId: string, assignmentId: string) {
    if (!roster) {
      setError(t('loadFirst'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/rosters/${roster.id}/shifts/${shiftId}/assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      await refreshRoster(roster.id);
      setMessage(t('assignmentRemoved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function publishRoster() {
    if (!roster) {
      setError(t('loadFirst'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/rosters/${roster.id}/publish`, {
        method: 'POST',
      });
      await refreshRoster(roster.id);
      setMessage(t('published'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function requestShiftSwap() {
    if (!roster) {
      setError(t('loadFirst'));
      return;
    }
    if (!swapShiftId || !swapFromPersonId || !swapToPersonId) {
      setError(t('swapMissingFields'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/workflows/shift-swaps', {
        method: 'POST',
        body: JSON.stringify({
          shiftId: swapShiftId,
          fromPersonId: swapFromPersonId,
          toPersonId: swapToPersonId,
          reason: swapReason,
        }),
      });
      await refreshRoster(roster.id);
      setMessage(t('swapRequested'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')} breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}>
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <div className="cq-inline-actions">
        <button type="button" disabled={loading} onClick={() => void loadCurrentRoster()}>
          {loading ? t('loading') : t('loadCurrent')}
        </button>
        <button type="button" disabled={loading} onClick={() => void createDraftRoster()}>
          {t('createDraft')}
        </button>
        <button type="button" disabled={loading || !roster} onClick={() => void publishRoster()}>
          {t('publish')}
        </button>
      </div>

      <StatusBanner message={message} error={error} />

      {roster ? (
        <SectionCard>
          <h2>{t('rosterDetail')}</h2>
          <dl className="cq-kv-grid">
            <dt>{t('status')}</dt>
            <dd><StatusBadge status={roster.status} /></dd>
            <dt>{t('period')}</dt>
            <dd>{roster.periodStart} &ndash; {roster.periodEnd}</dd>
          </dl>
        </SectionCard>
      ) : null}

      <SectionCard>
        <h2>{t('createDraft')}</h2>
        <div className="cq-grid-3">
          <label className="cq-form-field">
            <span>{t('organizationUnitId')}</span>
            <input
              value={draftOrganizationUnitId}
              onChange={(event) => setDraftOrganizationUnitId(event.target.value)}
            />
          </label>

          <label className="cq-form-field">
            <span>{t('periodStart')}</span>
            <input
              type="datetime-local"
              value={draftPeriodStart}
              onChange={(event) => setDraftPeriodStart(event.target.value)}
            />
          </label>

          <label className="cq-form-field">
            <span>{t('periodEnd')}</span>
            <input
              type="datetime-local"
              value={draftPeriodEnd}
              onChange={(event) => setDraftPeriodEnd(event.target.value)}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('createShift')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('startTime')}</span>
            <input
              type="datetime-local"
              value={shiftStart}
              onChange={(event) => setShiftStart(event.target.value)}
            />
          </label>

          <label className="cq-form-field">
            <span>{t('endTime')}</span>
            <input
              type="datetime-local"
              value={shiftEnd}
              onChange={(event) => setShiftEnd(event.target.value)}
            />
          </label>

          <label className="cq-form-field">
            <span>{t('shiftType')}</span>
            <input value={shiftType} onChange={(event) => setShiftType(event.target.value)} />
          </label>

          <label className="cq-form-field">
            <span>{t('minStaffing')}</span>
            <input
              type="number"
              min={1}
              value={minStaffing}
              onChange={(event) => setMinStaffing(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="cq-space-top-sm">
          <button type="button" disabled={loading || !roster} onClick={() => void createShift()}>
            {t('create')}
          </button>
        </div>
      </SectionCard>

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
                      <span>{toLocalDateTimeInput(shift.startTime)} &ndash; {toLocalDateTimeInput(shift.endTime)}</span>
                    </div>
                    <div className="cq-list-item-meta">
                      <span className={isUnderstaffed ? 'cq-status-dot cq-status-dot-warn' : 'cq-status-dot cq-status-dot-ok'} />
                      <span>{t('assigned')}: {shift.assignments.length} / {shift.minStaffing}</span>
                    </div>
                  </div>

                  {isUnderstaffed ? (
                    <div className="cq-status-warning">{t('minStaffingWarning')}</div>
                  ) : null}

                  <div className="cq-flex-center cq-space-top-xs">
                    <select
                      aria-label={t('assignPersonLabel')}
                      value={selectedPerson}
                      onChange={(event) =>
                        setAssignSelection((current) => ({
                          ...current,
                          [shift.id]: event.target.value,
                        }))
                      }
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
                      onClick={() => void assignShift(shift.id)}
                    >
                      {t('assign')}
                    </button>
                  </div>

                  {shift.assignments.length > 0 ? (
                    <ul className="cq-space-top-xs">
                      {shift.assignments.map((assignment) => (
                        <li key={assignment.id} className="cq-list-item-meta">
                          <span>{assignment.firstName} {assignment.lastName}</span>
                          <button
                            type="button"
                            className="cq-btn-ghost cq-btn-sm"
                            aria-label={`${t('removeAssignment')}: ${assignment.firstName} ${assignment.lastName}`}
                            disabled={loading}
                            onClick={() => void unassignShift(shift.id, assignment.id)}
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

      <SectionCard>
        <h2>{t('swapTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('swapShiftId')}</span>
            <input value={swapShiftId} onChange={(event) => setSwapShiftId(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('swapFromPersonId')}</span>
            <input
              value={swapFromPersonId}
              onChange={(event) => setSwapFromPersonId(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('swapToPersonId')}</span>
            <input
              value={swapToPersonId}
              onChange={(event) => setSwapToPersonId(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('swapReason')}</span>
            <input value={swapReason} onChange={(event) => setSwapReason(event.target.value)} />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button
            type="button"
            disabled={loading || !roster}
            onClick={() => void requestShiftSwap()}
          >
            {t('swapRequest')}
          </button>
        </div>
      </SectionCard>

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
                    data-level={planVsActual.complianceRate < 0.7 ? 'error' : planVsActual.complianceRate < 0.9 ? 'warn' : undefined}
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
                    <td><StatusBadge status={slot.compliant ? 'OK' : 'FAIL'} label={slot.compliant ? t('yes') : t('no')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SectionCard>
    </PageShell>
  );
}
