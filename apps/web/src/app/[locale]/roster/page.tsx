'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSessionContext } from '../../../components/AppWorkspace';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  assignShift,
  createDraftRoster,
  createShift,
  loadCurrentRoster,
  publishRoster,
  requestShiftSwap,
  unassignShift,
  type RosterOperationContext,
} from './roster-operations';
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

const ROSTER_MANAGERS = new Set(['SHIFT_PLANNER', 'HR', 'ADMIN']);

export default function RosterPage() {
  const t = useTranslations('pages.roster');
  const params = useParams<{ locale: string }>();
  const locale = String(params?.locale ?? 'de');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const { profile } = useSessionContext();
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
  const canManage = ROSTER_MANAGERS.has(profile?.role ?? '');
  const canEdit = canManage && roster?.status === 'DRAFT';
  const operations: RosterOperationContext = {
    apiRequest,
    t,
    roster,
    setRoster,
    setPlanVsActual,
    setMessage,
    setError,
    setLoading,
    draftOrganizationUnitId,
    setDraftOrganizationUnitId,
    draftPeriodStart,
    draftPeriodEnd,
    shiftStart,
    shiftEnd,
    shiftType,
    minStaffing,
    assignSelection,
    swapShiftId,
    swapFromPersonId,
    swapToPersonId,
    swapReason,
  };

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
        canManage={canManage}
        onLoadCurrentRoster={() => void loadCurrentRoster(operations)}
        onCreateDraftRoster={() => void createDraftRoster(operations)}
        onPublishRoster={() => void publishRoster(operations)}
      />
      <StatusBanner message={message} error={error} />
      <RosterDetailSection t={t} roster={roster} />
      <DraftRosterSection
        t={t}
        canManage={canManage}
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
        canEdit={canEdit}
        shiftStart={shiftStart}
        shiftEnd={shiftEnd}
        shiftType={shiftType}
        minStaffing={minStaffing}
        onShiftStartChange={setShiftStart}
        onShiftEndChange={setShiftEnd}
        onShiftTypeChange={setShiftType}
        onMinStaffingChange={setMinStaffing}
        onCreateShift={() => void createShift(operations)}
      />
      <ShiftsSection
        t={t}
        loading={loading}
        roster={roster}
        canEdit={canEdit}
        assignSelection={assignSelection}
        onAssignSelectionChange={(shiftId, personId) =>
          setAssignSelection((current) => ({ ...current, [shiftId]: personId }))
        }
        onAssignShift={(shiftId) => void assignShift(operations, shiftId)}
        onUnassignShift={(shiftId, assignmentId) =>
          void unassignShift(operations, shiftId, assignmentId)
        }
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
        onRequestShiftSwap={() => void requestShiftSwap(operations)}
      />
      <PlanVsActualSection t={t} planVsActual={planVsActual} />
    </PageShell>
  );
}
