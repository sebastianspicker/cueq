'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  CreateShiftSection,
  DraftRosterSection,
  PlanVsActualSection,
  RosterCommandBar,
  RosterDetailSection,
  ShiftSwapSection,
  ShiftsSection,
  type PlanVsActual,
  type RosterDetail,
} from './roster-sections';

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
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <RosterCommandBar
        t={t}
        loading={loading}
        roster={roster}
        onLoadCurrentRoster={() => void loadCurrentRoster()}
        onCreateDraftRoster={() => void createDraftRoster()}
        onPublishRoster={() => void publishRoster()}
      />

      <StatusBanner message={message} error={error} />

      <RosterDetailSection t={t} roster={roster} />
      <DraftRosterSection
        t={t}
        draftOrganizationUnitId={draftOrganizationUnitId}
        draftPeriodStart={draftPeriodStart}
        draftPeriodEnd={draftPeriodEnd}
        onDraftOrganizationUnitIdChange={setDraftOrganizationUnitId}
        onDraftPeriodStartChange={setDraftPeriodStart}
        onDraftPeriodEndChange={setDraftPeriodEnd}
      />
      <CreateShiftSection
        t={t}
        loading={loading}
        roster={roster}
        shiftStart={shiftStart}
        shiftEnd={shiftEnd}
        shiftType={shiftType}
        minStaffing={minStaffing}
        onShiftStartChange={setShiftStart}
        onShiftEndChange={setShiftEnd}
        onShiftTypeChange={setShiftType}
        onMinStaffingChange={setMinStaffing}
        onCreateShift={() => void createShift()}
      />
      <ShiftsSection
        t={t}
        loading={loading}
        roster={roster}
        assignSelection={assignSelection}
        onAssignSelectionChange={(shiftId, personId) =>
          setAssignSelection((current) => ({ ...current, [shiftId]: personId }))
        }
        onAssignShift={(shiftId) => void assignShift(shiftId)}
        onUnassignShift={(shiftId, assignmentId) => void unassignShift(shiftId, assignmentId)}
      />
      <ShiftSwapSection
        t={t}
        loading={loading}
        roster={roster}
        swapShiftId={swapShiftId}
        swapFromPersonId={swapFromPersonId}
        swapToPersonId={swapToPersonId}
        swapReason={swapReason}
        onSwapShiftIdChange={setSwapShiftId}
        onSwapFromPersonIdChange={setSwapFromPersonId}
        onSwapToPersonIdChange={setSwapToPersonId}
        onSwapReasonChange={setSwapReason}
        onRequestShiftSwap={() => void requestShiftSwap()}
      />
      <PlanVsActualSection t={t} planVsActual={planVsActual} />
    </PageShell>
  );
}
