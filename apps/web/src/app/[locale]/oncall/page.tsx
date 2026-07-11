'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  ComplianceSection,
  DeploymentsSection,
  OnCallCommandBar,
  OnCallFormSection,
  RotationsSection,
  type ComplianceResult,
  type MeResponse,
  type OnCallDeployment,
  type OnCallRotation,
} from './oncall-sections';

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
      setError(t('rotationMissingFields'));
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
      setError(t('updateRotationIdRequired'));
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
      setError(t('deploymentMissingFields'));
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

      <OnCallCommandBar
        t={t}
        loading={loading}
        onLoadRotations={() => void loadRotations()}
        onLoadDeployments={() => void loadDeployments()}
        onRunCompliance={() => void runCompliance()}
      />

      <StatusBanner message={message} error={error} />

      <OnCallFormSection
        t={t}
        loading={loading}
        canManageRotations={canManageRotations}
        personId={personId}
        organizationUnitId={organizationUnitId}
        rotationId={rotationId}
        startTime={startTime}
        endTime={endTime}
        rotationType={rotationType}
        ticketReference={ticketReference}
        eventReference={eventReference}
        description={description}
        note={note}
        nextShiftStart={nextShiftStart}
        remote={remote}
        updateRotationId={updateRotationId}
        onPersonIdChange={setPersonId}
        onOrganizationUnitIdChange={setOrganizationUnitId}
        onRotationIdChange={setRotationId}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        onRotationTypeChange={setRotationType}
        onTicketReferenceChange={setTicketReference}
        onEventReferenceChange={setEventReference}
        onDescriptionChange={setDescription}
        onNoteChange={setNote}
        onNextShiftStartChange={setNextShiftStart}
        onRemoteChange={setRemote}
        onUpdateRotationIdChange={setUpdateRotationId}
        onCreateDeployment={() => void createDeployment()}
        onCreateRotation={() => void createRotation()}
        onUpdateRotation={() => void updateRotation()}
      />
      <RotationsSection t={t} rotations={rotations} />
      <DeploymentsSection t={t} deployments={deployments} />
      <ComplianceSection t={t} compliance={compliance} />
    </PageShell>
  );
}
