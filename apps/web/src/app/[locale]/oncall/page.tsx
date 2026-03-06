'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { FormField } from '../../../components/FormField';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface OnCallRotation {
  id: string;
  personId: string;
  organizationUnitId: string;
  startTime: string;
  endTime: string;
  rotationType: 'WEEKLY' | 'DAILY' | 'CUSTOM';
  note?: string | null;
}

interface OnCallDeployment {
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

interface ComplianceResult {
  personId: string;
  compliant: boolean;
  requiredRestHours: number;
  actualRestHours: number;
  violation: string | null;
}

interface MeResponse {
  id: string;
  role: string;
}

const APPROVAL_ROLES = new Set(['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN']);

export default function OnCallPage() {
  const t = useTranslations('pages.oncall');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [rotations, setRotations] = useState<OnCallRotation[]>([]);
  const [deployments, setDeployments] = useState<OnCallDeployment[]>([]);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);

  const [personId, setPersonId] = useState('');
  const [organizationUnitId, setOrganizationUnitId] = useState('');
  const [rotationId, setRotationId] = useState('');
  const [startTime, setStartTime] = useState('2026-03-03T08:00:00.000Z');
  const [endTime, setEndTime] = useState('2026-03-10T08:00:00.000Z');
  const [rotationType, setRotationType] = useState<'WEEKLY' | 'DAILY' | 'CUSTOM'>('WEEKLY');
  const [note, setNote] = useState('');
  const [ticketReference, setTicketReference] = useState('');
  const [eventReference, setEventReference] = useState('');
  const [description, setDescription] = useState('');
  const [remote, setRemote] = useState(true);
  const [nextShiftStart, setNextShiftStart] = useState('2026-03-10T09:00:00.000Z');
  const [updateRotationId, setUpdateRotationId] = useState('');

  async function resolveMe() {
    if (me) {
      return me;
    }

    const next = await apiRequest<MeResponse>('/v1/me');
    setMe(next);
    return next;
  }

  useEffect(() => {
    setMe(null);
    if (!token) {
      return;
    }

    let active = true;
    void apiRequest<MeResponse>('/v1/me')
      .then((next) => {
        if (active) {
          setMe(next);
        }
      })
      .catch(() => {
        if (active) {
          setMe(null);
        }
      });

    return () => {
      active = false;
    };
  }, [apiRequest, token]);

  async function loadRotations() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<OnCallRotation[]>('/v1/oncall/rotations');
      setRotations(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadDeployments() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<OnCallDeployment[]>('/v1/oncall/deployments');
      setDeployments(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function runCompliance() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const current = await resolveMe();
      const targetPersonId = personId || current.id;
      const data = await apiRequest<ComplianceResult>(
        `/v1/oncall/compliance?personId=${encodeURIComponent(targetPersonId)}&nextShiftStart=${encodeURIComponent(nextShiftStart)}`,
      );
      setCompliance(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function createRotation() {
    if (!personId || !organizationUnitId) {
      setError(t('requestFailed'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/oncall/rotations', {
        method: 'POST',
        body: JSON.stringify({
          personId,
          organizationUnitId,
          startTime,
          endTime,
          rotationType,
          note: note || undefined,
        }),
      });
      setMessage(t('rotationCreated'));
      await loadRotations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function updateRotation() {
    if (!updateRotationId) {
      setError(t('requestFailed'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/oncall/rotations/${updateRotationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startTime,
          endTime,
          rotationType,
          note: note || undefined,
        }),
      });
      setMessage(t('rotationUpdated'));
      await loadRotations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function createDeployment() {
    if (!personId || !rotationId) {
      setError(t('requestFailed'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/oncall/deployments', {
        method: 'POST',
        body: JSON.stringify({
          personId,
          rotationId,
          startTime,
          endTime,
          remote,
          ticketReference: ticketReference || undefined,
          eventReference: eventReference || undefined,
          description: description || undefined,
        }),
      });
      setMessage(t('deploymentCreated'));
      await loadDeployments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  const canManageRotations = me ? APPROVAL_ROLES.has(me.role) : false;

  return (
    <PageShell title={t('title')} description={t('description')}>
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <div className="cq-flex-wrap">
        <button type="button" disabled={loading} onClick={() => void loadRotations()}>
          {loading ? t('loading') : t('loadRotations')}
        </button>
        <button type="button" disabled={loading} onClick={() => void loadDeployments()}>
          {loading ? t('loading') : t('loadDeployments')}
        </button>
        <button type="button" disabled={loading} onClick={() => void runCompliance()}>
          {loading ? t('loading') : t('runCompliance')}
        </button>
      </div>

      <StatusBanner message={message} error={error} />

      <SectionCard>
        <h2>{t('createDeploymentTitle')}</h2>
        <div className="cq-grid-2">
          <FormField label={t('personIdLabel')}>
            <input value={personId} onChange={(event) => setPersonId(event.target.value)} />
          </FormField>
          <FormField label={t('organizationUnitIdLabel')}>
            <input
              value={organizationUnitId}
              onChange={(event) => setOrganizationUnitId(event.target.value)}
            />
          </FormField>
          <FormField label={t('rotationIdLabel')}>
            <input value={rotationId} onChange={(event) => setRotationId(event.target.value)} />
          </FormField>
          <FormField label={t('startTimeLabel')}>
            <input value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </FormField>
          <FormField label={t('endTimeLabel')}>
            <input value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </FormField>
          <FormField label={t('rotationTypeLabel')}>
            <select
              value={rotationType}
              onChange={(event) =>
                setRotationType(event.target.value as 'WEEKLY' | 'DAILY' | 'CUSTOM')
              }
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="DAILY">DAILY</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </FormField>
          <FormField label={t('ticketLabel')}>
            <input
              value={ticketReference}
              onChange={(event) => setTicketReference(event.target.value)}
            />
          </FormField>
          <FormField label={t('eventLabel')}>
            <input
              value={eventReference}
              onChange={(event) => setEventReference(event.target.value)}
            />
          </FormField>
          <FormField label={t('descriptionLabel')}>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </FormField>
          <FormField label={t('noteLabel')}>
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <FormField label={t('nextShiftStartLabel')}>
            <input
              value={nextShiftStart}
              onChange={(event) => setNextShiftStart(event.target.value)}
            />
          </FormField>
          <FormField label={t('remoteLabel')}>
            <select
              value={remote ? 'true' : 'false'}
              onChange={(event) => setRemote(event.target.value === 'true')}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </FormField>
        </div>
        <div className="cq-flex-wrap cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void createDeployment()}>
            {loading ? t('loading') : t('createDeployment')}
          </button>
          {canManageRotations ? (
            <>
              <button type="button" disabled={loading} onClick={() => void createRotation()}>
                {loading ? t('loading') : t('createRotation')}
              </button>
              <FormField label={t('updateRotationTitle')}>
                <input
                  value={updateRotationId}
                  onChange={(event) => setUpdateRotationId(event.target.value)}
                />
              </FormField>
              <button type="button" disabled={loading} onClick={() => void updateRotation()}>
                {loading ? t('loading') : t('updateRotation')}
              </button>
            </>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('rotationsTitle')}</h2>
        {rotations.length === 0 ? (
          <p>{t('noRotations')}</p>
        ) : (
          <ul className="cq-list-stack-indented cq-stack-sm">
            {rotations.map((rotation) => (
              <li key={rotation.id}>
                {rotation.id} | {rotation.personId} | {rotation.startTime} - {rotation.endTime}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <h2>{t('deploymentsTitle')}</h2>
        {deployments.length === 0 ? (
          <p>{t('noDeployments')}</p>
        ) : (
          <ul className="cq-list-stack-indented cq-stack-sm">
            {deployments.map((deployment) => (
              <li key={deployment.id}>
                {deployment.id} | {deployment.personId} | {deployment.startTime} -{' '}
                {deployment.endTime ?? '-'}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {compliance ? (
        <SectionCard>
          <h2>{t('complianceTitle')}</h2>
          <p>
            person={compliance.personId}, compliant={String(compliance.compliant)}, requiredRest=
            {compliance.requiredRestHours}, actualRest={compliance.actualRestHours}
          </p>
          {compliance.violation ? <p>{compliance.violation}</p> : null}
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
