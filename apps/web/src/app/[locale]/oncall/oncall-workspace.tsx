'use client';

import type { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { OnCallCommandBar } from './oncall-command';
import { ComplianceSection, DeploymentsSection, RotationsSection } from './oncall-data-sections';
import { OnCallFormSection } from './oncall-form';
import type { useOnCallWorkspace } from './use-oncall-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type OnCallWorkspaceState = ReturnType<typeof useOnCallWorkspace>;

export function OnCallWorkspace({
  t,
  workspace,
}: {
  t: TranslationFn;
  workspace: OnCallWorkspaceState;
}) {
  return (
    <PageShell title={t('title')} description={t('description')}>
      <OnCallCommandBar
        t={t}
        loading={workspace.loading}
        onLoadRotations={() => void workspace.loadRotations()}
        onLoadDeployments={() => void workspace.loadDeployments()}
        onRunCompliance={() => void workspace.runCompliance()}
      />

      <StatusBanner message={workspace.message} error={workspace.error} />

      <OnCallFormSection
        t={t}
        loading={workspace.loading}
        canManageRotations={workspace.canManageRotations}
        personId={workspace.personId}
        organizationUnitId={workspace.organizationUnitId}
        rotationId={workspace.rotationId}
        startTime={workspace.startTime}
        endTime={workspace.endTime}
        rotationType={workspace.rotationType}
        ticketReference={workspace.ticketReference}
        eventReference={workspace.eventReference}
        description={workspace.description}
        note={workspace.note}
        nextShiftStart={workspace.nextShiftStart}
        remote={workspace.remote}
        updateRotationId={workspace.updateRotationId}
        onPersonIdChange={workspace.setPersonId}
        onOrganizationUnitIdChange={workspace.setOrganizationUnitId}
        onRotationIdChange={workspace.setRotationId}
        onStartTimeChange={workspace.setStartTime}
        onEndTimeChange={workspace.setEndTime}
        onRotationTypeChange={workspace.setRotationType}
        onTicketReferenceChange={workspace.setTicketReference}
        onEventReferenceChange={workspace.setEventReference}
        onDescriptionChange={workspace.setDescription}
        onNoteChange={workspace.setNote}
        onNextShiftStartChange={workspace.setNextShiftStart}
        onRemoteChange={workspace.setRemote}
        onUpdateRotationIdChange={workspace.setUpdateRotationId}
        onCreateDeployment={() => void workspace.createDeployment()}
        onCreateRotation={() => void workspace.createRotation()}
        onUpdateRotation={() => void workspace.updateRotation()}
      />
      <RotationsSection t={t} rotations={workspace.rotations} />
      <DeploymentsSection t={t} deployments={workspace.deployments} />
      <ComplianceSection t={t} compliance={workspace.compliance} />
    </PageShell>
  );
}
