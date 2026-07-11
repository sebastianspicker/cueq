'use client';

import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export interface OnCallRotation {
  id: string;
  personId: string;
  organizationUnitId: string;
  startTime: string;
  endTime: string;
  rotationType: 'WEEKLY' | 'DAILY' | 'CUSTOM';
  note?: string | null;
}

export interface OnCallDeployment {
  id: string;
  personId: string;
  rotationId: string;
  startTime: string;
  endTime: string | null;
  remote: boolean;
  ticketReference?: string | null;
  eventReference?: string | null;
  description?: string | null;
}

export interface ComplianceResult {
  personId: string;
  compliant: boolean;
  requiredRestHours: number;
  actualRestHours: number;
  violation: string | null;
}

export interface MeResponse {
  id: string;
  role: string;
}

type TranslationFn = ReturnType<typeof useTranslations>;

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

function OnCallFormFields(props: OnCallFormSectionProps) {
  return (
    <div className="cq-grid-2">
      <FormField label={props.t('personIdLabel')}>
        <input
          value={props.personId}
          onChange={(event) => props.onPersonIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('organizationUnitIdLabel')}>
        <input
          value={props.organizationUnitId}
          onChange={(event) => props.onOrganizationUnitIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('rotationIdLabel')}>
        <input
          value={props.rotationId}
          onChange={(event) => props.onRotationIdChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('startTimeLabel')}>
        <input
          value={props.startTime}
          onChange={(event) => props.onStartTimeChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('endTimeLabel')}>
        <input
          value={props.endTime}
          onChange={(event) => props.onEndTimeChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('rotationTypeLabel')}>
        <select
          value={props.rotationType}
          onChange={(event) =>
            props.onRotationTypeChange(event.target.value as 'WEEKLY' | 'DAILY' | 'CUSTOM')
          }
        >
          <option value="WEEKLY">WEEKLY</option>
          <option value="DAILY">DAILY</option>
          <option value="CUSTOM">CUSTOM</option>
        </select>
      </FormField>
      <FormField label={props.t('ticketLabel')}>
        <input
          value={props.ticketReference}
          onChange={(event) => props.onTicketReferenceChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('eventLabel')}>
        <input
          value={props.eventReference}
          onChange={(event) => props.onEventReferenceChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('descriptionLabel')}>
        <input
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('noteLabel')}>
        <input value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} />
      </FormField>
      <FormField label={props.t('nextShiftStartLabel')}>
        <input
          value={props.nextShiftStart}
          onChange={(event) => props.onNextShiftStartChange(event.target.value)}
        />
      </FormField>
      <FormField label={props.t('remoteLabel')}>
        <select
          value={props.remote ? 'true' : 'false'}
          onChange={(event) => props.onRemoteChange(event.target.value === 'true')}
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
      <OnCallFormFields {...props} />
      <div className="cq-flex-wrap cq-space-top-sm">
        <button type="button" disabled={props.loading} onClick={props.onCreateDeployment}>
          {props.loading ? props.t('loading') : props.t('createDeployment')}
        </button>
        {props.canManageRotations ? (
          <>
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
                    {deployment.startTime} &ndash; {deployment.endTime ?? '—'}
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
        <dd>{compliance.requiredRestHours}h</dd>
        <dt>{t('actualRestLabel')}</dt>
        <dd>{compliance.actualRestHours}h</dd>
      </dl>
      {compliance.violation ? (
        <div className="cq-status-warning">{compliance.violation}</div>
      ) : null}
    </SectionCard>
  );
}
