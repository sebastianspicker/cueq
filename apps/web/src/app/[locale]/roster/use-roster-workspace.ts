'use client';

import { useState } from 'react';
import type { useTranslations } from 'next-intl';
import { useSessionContext } from '../../../components/AppWorkspace';
import { useApiContext } from '../../../platform/http/api-context';
import type { RosterOperationContext } from './roster-operations';
import type { PlanVsActual, RosterDetail } from './roster-types';

const ROSTER_MANAGERS = new Set(['SHIFT_PLANNER', 'HR', 'ADMIN']);
type TranslationFn = ReturnType<typeof useTranslations>;

export function useRosterWorkspace(t: TranslationFn) {
  const { apiRequest } = useApiContext();
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
  const [swapReason, setSwapReason] = useState(t('swapReasonDefault'));
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

  return {
    roster,
    planVsActual,
    message,
    error,
    loading,
    shiftStart,
    shiftEnd,
    shiftType,
    minStaffing,
    assignSelection,
    draftOrganizationUnitId,
    draftPeriodStart,
    draftPeriodEnd,
    swapShiftId,
    swapFromPersonId,
    swapToPersonId,
    swapReason,
    canManage,
    canEdit,
    operations,
    setShiftStart,
    setShiftEnd,
    setShiftType,
    setMinStaffing,
    setAssignSelection,
    setDraftOrganizationUnitId,
    setDraftPeriodStart,
    setDraftPeriodEnd,
    setSwapShiftId,
    setSwapFromPersonId,
    setSwapToPersonId,
    setSwapReason,
  };
}

export type RosterWorkspaceState = ReturnType<typeof useRosterWorkspace>;
