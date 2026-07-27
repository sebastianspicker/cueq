import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnCallFormSection } from './oncall-sections';

function renderForm(canManageRotations: boolean) {
  const noop = vi.fn();
  render(
    <OnCallFormSection
      t={((key: string) => key) as never}
      loading={false}
      canManageRotations={canManageRotations}
      personId=""
      organizationUnitId=""
      rotationId=""
      startTime="2026-03-03T08:00:00.000Z"
      endTime="2026-03-03T09:00:00.000Z"
      rotationType="CUSTOM"
      ticketReference=""
      eventReference=""
      description=""
      note=""
      nextShiftStart="2026-03-04T08:00:00.000Z"
      remote={true}
      updateRotationId=""
      onPersonIdChange={noop}
      onOrganizationUnitIdChange={noop}
      onRotationIdChange={noop}
      onStartTimeChange={noop}
      onEndTimeChange={noop}
      onRotationTypeChange={noop}
      onTicketReferenceChange={noop}
      onEventReferenceChange={noop}
      onDescriptionChange={noop}
      onNoteChange={noop}
      onNextShiftStartChange={noop}
      onRemoteChange={noop}
      onUpdateRotationIdChange={noop}
      onCreateDeployment={noop}
      onCreateRotation={noop}
      onUpdateRotation={noop}
    />,
  );
}

describe('OnCallFormSection authorization', () => {
  it('hides every on-call mutation control from employees', () => {
    renderForm(false);

    expect(screen.queryByRole('button', { name: 'createDeployment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'createRotation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'updateRotation' })).not.toBeInTheDocument();
  });

  it('shows on-call mutation controls to roles accepted by the API', () => {
    renderForm(true);

    expect(screen.getByRole('button', { name: 'createDeployment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'createRotation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'updateRotation' })).toBeInTheDocument();
  });
});
