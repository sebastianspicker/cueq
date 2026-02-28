'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

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

  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
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

  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ''), [apiBaseUrl]);

  async function apiRequest(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const detail =
        (typeof data?.message === 'string' && data.message) ||
        (typeof data?.error === 'string' && data.error) ||
        text ||
        t('requestFailed');
      throw new Error(detail);
    }

    return data;
  }

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

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('apiBaseLabel')}</span>
        <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('tokenLabel')}</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="mock.eyJzdWIiOiJjLi4uIn0"
        />
      </label>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
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

      {message ? <p style={{ color: '#0f766e' }}>{message}</p> : null}
      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      {roster ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('rosterDetail')}</h2>
          <p>
            {t('status')}: <strong>{roster.status}</strong>
          </p>
          <p>
            {t('period')}: {roster.periodStart} - {roster.periodEnd}
          </p>
        </article>
      ) : null}

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('createDraft')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('organizationUnitId')}</span>
            <input
              value={draftOrganizationUnitId}
              onChange={(event) => setDraftOrganizationUnitId(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('periodStart')}</span>
            <input
              type="datetime-local"
              value={draftPeriodStart}
              onChange={(event) => setDraftPeriodStart(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('periodEnd')}</span>
            <input
              type="datetime-local"
              value={draftPeriodEnd}
              onChange={(event) => setDraftPeriodEnd(event.target.value)}
            />
          </label>
        </div>
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('createShift')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('startTime')}</span>
            <input
              type="datetime-local"
              value={shiftStart}
              onChange={(event) => setShiftStart(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('endTime')}</span>
            <input
              type="datetime-local"
              value={shiftEnd}
              onChange={(event) => setShiftEnd(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('shiftType')}</span>
            <input value={shiftType} onChange={(event) => setShiftType(event.target.value)} />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('minStaffing')}</span>
            <input
              type="number"
              min={1}
              value={minStaffing}
              onChange={(event) => setMinStaffing(Number(event.target.value))}
            />
          </label>
        </div>

        <div style={{ marginTop: '.75rem' }}>
          <button type="button" disabled={loading || !roster} onClick={() => void createShift()}>
            {t('create')}
          </button>
        </div>
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('shifts')}</h2>
        {!roster || roster.shifts.length === 0 ? (
          <p>{t('noShifts')}</p>
        ) : (
          <ul style={{ display: 'grid', gap: '.75rem', paddingLeft: '1.2rem' }}>
            {roster.shifts.map((shift) => {
              const warning =
                shift.assignments.length < shift.minStaffing ? t('minStaffingWarning') : null;
              const defaultCandidate = roster.members[0]?.id ?? '';
              const selectedPerson = assignSelection[shift.id] ?? defaultCandidate;

              return (
                <li key={shift.id}>
                  <div>
                    <strong>{shift.shiftType}</strong> ({toLocalDateTimeInput(shift.startTime)} -{' '}
                    {toLocalDateTimeInput(shift.endTime)})
                  </div>
                  <div>
                    {t('assigned')}: {shift.assignments.length} / {shift.minStaffing}
                  </div>
                  {warning ? <div style={{ color: '#b45309' }}>{warning}</div> : null}

                  <div
                    style={{
                      display: 'flex',
                      gap: '.5rem',
                      alignItems: 'center',
                      marginTop: '.25rem',
                    }}
                  >
                    <select
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
                      disabled={loading}
                      onClick={() => void assignShift(shift.id)}
                    >
                      {t('assign')}
                    </button>
                  </div>

                  {shift.assignments.length > 0 ? (
                    <ul style={{ marginTop: '.35rem' }}>
                      {shift.assignments.map((assignment) => (
                        <li key={assignment.id}>
                          {assignment.firstName} {assignment.lastName}{' '}
                          <button
                            type="button"
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
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('planVsActual')}</h2>
        {!planVsActual ? (
          <p>{t('noPlanVsActual')}</p>
        ) : (
          <>
            <p>
              {t('summary')}: {planVsActual.totalSlots} {t('slots')}, {planVsActual.mismatchedSlots}{' '}
              {t('mismatches')}, {planVsActual.understaffedSlots} {t('understaffed')}
            </p>
            <p>
              {t('complianceRate')}: {planVsActual.complianceRate} | {t('coverageRate')}:{' '}
              {planVsActual.coverageRate}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{t('shift')}</th>
                  <th style={{ textAlign: 'left' }}>{t('planned')}</th>
                  <th style={{ textAlign: 'left' }}>{t('actual')}</th>
                  <th style={{ textAlign: 'left' }}>{t('delta')}</th>
                  <th style={{ textAlign: 'left' }}>{t('compliant')}</th>
                </tr>
              </thead>
              <tbody>
                {planVsActual.slots.map((slot) => (
                  <tr key={slot.shiftId}>
                    <td>{slot.shiftId}</td>
                    <td>{slot.plannedHeadcount}</td>
                    <td>{slot.actualHeadcount}</td>
                    <td>{slot.delta}</td>
                    <td>{slot.compliant ? t('yes') : t('no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </article>
    </section>
  );
}
