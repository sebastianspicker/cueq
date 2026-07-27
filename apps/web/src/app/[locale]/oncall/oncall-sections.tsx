'use client';

/** Presentational on-call rotation, deployment, and compliance sections. */

import type {
  OnCallComplianceCheck as SharedOnCallComplianceCheck,
  OnCallDeployment as SharedOnCallDeployment,
  OnCallRotation as SharedOnCallRotation,
  UserProfile,
} from '@cueq/shared';
import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export type OnCallRotation = SharedOnCallRotation;
export type OnCallDeployment = SharedOnCallDeployment;
export type ComplianceResult = SharedOnCallComplianceCheck;
export type MeResponse = Pick<UserProfile, 'id' | 'role'>;

type TranslationFn = ReturnType<typeof useTranslations>;

/** Renders command controls for the on-call workspace. */
export function OnCallCommandBar({
  t,
  loading,
  onLoadRotations,
  onLoadDeployments,
  onRunCompliance,
}: {
  t: TranslationFn;
  loading: boolean;
  onLoadRotations: () => void;
  onLoadDeployments: () => void;
  onRunCompliance: () => void;
}) {
  return (
    <div className="cq-flex-wrap">
      <button type="button" disabled={loading} onClick={onLoadRotations}>
        {loading ? t('loading') : t('loadRotations')}
      </button>
      <button type="button" disabled={loading} onClick={onLoadDeployments}>
        {loading ? t('loading') : t('loadDeployments')}
      </button>
      <button type="button" disabled={loading} onClick={onRunCompliance}>
        {loading ? t('loading') : t('runCompliance')}
      </button>
    </div>
  );
}

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

/** Renders fields for creating or editing on-call planning data. */
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

/** Renders the API-filtered on-call rotation list. */
export function RotationsSection({
  t,
  rotations,
}: {
  t: TranslationFn;
  rotations: OnCallRotation[];
}) {
  return (
    <SectionCard>
      <h2>{t('rotationsTitle')}</h2>
      {rotations.length === 0 ? (
        <p>{t('noRotations')}</p>
      ) : (
        <ul className="cq-list-stack">
          {rotations.map((rotation) => (
            <li key={rotation.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge
                    status={rotation.rotationType}
                    variant="info"
                    label={rotation.rotationType}
                  />
                  <span>
                    {rotation.startTime} &ndash; {rotation.endTime}
                  </span>
                </div>
              </div>
              <p className="cq-mono">{rotation.id}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Renders deployments associated with the selected rotation. */
export function DeploymentsSection({
  t,
  deployments,
}: {
  t: TranslationFn;
  deployments: OnCallDeployment[];
}) {
  return (
    <SectionCard>
      <h2>{t('deploymentsTitle')}</h2>
      {deployments.length === 0 ? (
        <p>{t('noDeployments')}</p>
      ) : (
        <ul className="cq-list-stack">
          {deployments.map((deployment) => (
            <li key={deployment.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge
                    status={deployment.remote ? 'Remote' : 'On-site'}
                    variant={deployment.remote ? 'info' : 'muted'}
                  />
                  <span>
                    {deployment.startTime} &ndash; {deployment.endTime ?? '-'}
                  </span>
                </div>
              </div>
              {deployment.description ? <p>{deployment.description}</p> : null}
              <p className="cq-mono">{deployment.id}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Renders API-calculated on-call compliance results. */
export function ComplianceSection({
  t,
  compliance,
}: {
  t: TranslationFn;
  compliance: ComplianceResult | null;
}) {
  if (!compliance) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('complianceTitle')}</h2>
      <dl className="cq-kv-grid">
        <dt>{t('personIdLabel')}</dt>
        <dd>{compliance.personId}</dd>
        <dt>{t('compliantLabel')}</dt>
        <dd>
          <StatusBadge
            status={compliance.compliant ? 'COMPLIANT' : 'FAIL'}
            label={compliance.compliant ? t('compliantYes') : t('compliantNo')}
          />
        </dd>
        <dt>{t('requiredRestLabel')}</dt>
        <dd>{compliance.minimumRestHours}h</dd>
        <dt>{t('actualRestLabel')}</dt>
        <dd>{compliance.restHoursAfterDeployment}h</dd>
      </dl>
      {compliance.violations.map((violation) => (
        <div key={`${violation.code}:${violation.message}`} className="cq-status-warning">
          {violation.message}
        </div>
      ))}
    </SectionCard>
  );
}
