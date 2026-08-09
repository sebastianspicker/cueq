'use client';

import type { useTranslations } from 'next-intl';
import { StatusBanner } from '../../../components/StatusBanner';
import {
  assignShift,
  createDraftRoster,
  createShift,
  loadCurrentRoster,
  publishRoster,
  requestShiftSwap,
  unassignShift,
} from './roster-operations';
import {
  DraftRosterSection,
  RosterCommandBar,
  RosterDetailSection,
} from './roster-command-sections';
import { CreateShiftSection } from './roster-shift-editor';
import { ShiftsSection } from './roster-shifts-section';
import { PlanVsActualSection, ShiftSwapSection } from './roster-swap-plan-sections';
import type { RosterWorkspaceState } from './use-roster-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Renders the roster sections from hook-owned state and actions. */
export function RosterWorkspace({
  t,
  workspace,
}: {
  t: TranslationFn;
  workspace: RosterWorkspaceState;
}) {
  return (
    <>
      <RosterCommandBar
        t={t}
        loading={workspace.loading}
        roster={workspace.roster}
        canManage={workspace.canManage}
        onLoadCurrentRoster={() => void loadCurrentRoster(workspace.operations)}
        onCreateDraftRoster={() => void createDraftRoster(workspace.operations)}
        onPublishRoster={() => void publishRoster(workspace.operations)}
      />
      <StatusBanner message={workspace.message} error={workspace.error} />
      <RosterDetailSection t={t} roster={workspace.roster} />
      <DraftRosterSection
        t={t}
        canManage={workspace.canManage}
        draftOrganizationUnitId={workspace.draftOrganizationUnitId}
        draftPeriodStart={workspace.draftPeriodStart}
        draftPeriodEnd={workspace.draftPeriodEnd}
        onDraftOrganizationUnitIdChange={workspace.setDraftOrganizationUnitId}
        onDraftPeriodStartChange={workspace.setDraftPeriodStart}
        onDraftPeriodEndChange={workspace.setDraftPeriodEnd}
      />
      <CreateShiftSection
        t={t}
        loading={workspace.loading}
        roster={workspace.roster}
        canEdit={workspace.canEdit}
        shiftStart={workspace.shiftStart}
        shiftEnd={workspace.shiftEnd}
        shiftType={workspace.shiftType}
        minStaffing={workspace.minStaffing}
        onShiftStartChange={workspace.setShiftStart}
        onShiftEndChange={workspace.setShiftEnd}
        onShiftTypeChange={workspace.setShiftType}
        onMinStaffingChange={workspace.setMinStaffing}
        onCreateShift={() => void createShift(workspace.operations)}
      />
      <ShiftsSection
        t={t}
        loading={workspace.loading}
        roster={workspace.roster}
        canEdit={workspace.canEdit}
        assignSelection={workspace.assignSelection}
        onAssignSelectionChange={(shiftId, personId) =>
          workspace.setAssignSelection((current) => ({ ...current, [shiftId]: personId }))
        }
        onAssignShift={(shiftId) => void assignShift(workspace.operations, shiftId)}
        onUnassignShift={(shiftId, assignmentId) =>
          void unassignShift(workspace.operations, shiftId, assignmentId)
        }
      />
      <ShiftSwapSection
        t={t}
        loading={workspace.loading}
        roster={workspace.roster}
        swapShiftId={workspace.swapShiftId}
        swapFromPersonId={workspace.swapFromPersonId}
        swapToPersonId={workspace.swapToPersonId}
        swapReason={workspace.swapReason}
        onSwapShiftIdChange={workspace.setSwapShiftId}
        onSwapFromPersonIdChange={workspace.setSwapFromPersonId}
        onSwapToPersonIdChange={workspace.setSwapToPersonId}
        onSwapReasonChange={workspace.setSwapReason}
        onRequestShiftSwap={() => void requestShiftSwap(workspace.operations)}
      />
      <PlanVsActualSection t={t} planVsActual={workspace.planVsActual} />
    </>
  );
}
