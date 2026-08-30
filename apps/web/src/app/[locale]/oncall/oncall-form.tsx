'use client';

import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';

type TranslationFn = ReturnType<typeof useTranslations>;

interface OnCallFormSectionProps {
  t: TranslationFn;
  loading: boolean;
  canManageRotations: boolean;
  personId: string;
  organizationUnitId: string;
  rotationId: string;
  startTime: string;
  endTime: string;
  rotationType: 'WEEKLY' | 'DAILY' | 'CUSTOM';
  ticketReference: string;
  eventReference: string;
  description: string;
  note: string;
  nextShiftStart: string;
  remote: boolean;
  updateRotationId: string;
  onPersonIdChange: (value: string) => void;
  onOrganizationUnitIdChange: (value: string) => void;
  onRotationIdChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onRotationTypeChange: (value: 'WEEKLY' | 'DAILY' | 'CUSTOM') => void;
  onTicketReferenceChange: (value: string) => void;
  onEventReferenceChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onNextShiftStartChange: (value: string) => void;
  onRemoteChange: (value: boolean) => void;
  onUpdateRotationIdChange: (value: string) => void;
  onCreateDeployment: () => void;
  onCreateRotation: () => void;
  onUpdateRotation: () => void;
}

function OnCallFormFields({ form }: { form: OnCallFormSectionProps }) {
  return (
    <div className="cq-grid-2">
      <FormField label={form.t('personIdLabel')}>
        <input
          value={form.personId}
          onChange={(event) => form.onPersonIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('organizationUnitIdLabel')}>
        <input
          value={form.organizationUnitId}
          onChange={(event) => form.onOrganizationUnitIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('rotationIdLabel')}>
        <input
          value={form.rotationId}
          onChange={(event) => form.onRotationIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('startTimeLabel')}>
        <input
          value={form.startTime}
          onChange={(event) => form.onStartTimeChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('endTimeLabel')}>
        <input
          value={form.endTime}
          onChange={(event) => form.onEndTimeChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('rotationTypeLabel')}>
        <select
          value={form.rotationType}
          onChange={(event) =>
            form.onRotationTypeChange(event.target.value as 'WEEKLY' | 'DAILY' | 'CUSTOM')
          }
        >
          <option value="WEEKLY">WEEKLY</option>
          <option value="DAILY">DAILY</option>
          <option value="CUSTOM">CUSTOM</option>
        </select>
      </FormField>
      <FormField label={form.t('ticketLabel')}>
        <input
          value={form.ticketReference}
          onChange={(event) => form.onTicketReferenceChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('eventLabel')}>
        <input
          value={form.eventReference}
          onChange={(event) => form.onEventReferenceChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('descriptionLabel')}>
        <input
          value={form.description}
          onChange={(event) => form.onDescriptionChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('noteLabel')}>
        <input value={form.note} onChange={(event) => form.onNoteChange(event.target.value)} />
      </FormField>
      <FormField label={form.t('nextShiftStartLabel')}>
        <input
          value={form.nextShiftStart}
          onChange={(event) => form.onNextShiftStartChange(event.target.value)}
        />
      </FormField>
      <FormField label={form.t('remoteLabel')}>
        <select
          value={form.remote ? 'true' : 'false'}
          onChange={(event) => form.onRemoteChange(event.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </FormField>
    </div>
  );
}

export function OnCallFormSection(props: OnCallFormSectionProps) {
  return (
    <SectionCard>
      <h2>{props.t('createDeploymentTitle')}</h2>
      <OnCallFormFields form={props} />
      <div className="cq-flex-wrap cq-space-top-sm">
        {props.canManageRotations ? (
          <>
            <button type="button" disabled={props.loading} onClick={props.onCreateDeployment}>
              {props.loading ? props.t('loading') : props.t('createDeployment')}
            </button>
            <button type="button" disabled={props.loading} onClick={props.onCreateRotation}>
              {props.loading ? props.t('loading') : props.t('createRotation')}
            </button>
            <FormField label={props.t('updateRotationTitle')}>
              <input
                value={props.updateRotationId}
                onChange={(event) => props.onUpdateRotationIdChange(event.target.value)}
              />
            </FormField>
            <button type="button" disabled={props.loading} onClick={props.onUpdateRotation}>
              {props.loading ? props.t('loading') : props.t('updateRotation')}
            </button>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
