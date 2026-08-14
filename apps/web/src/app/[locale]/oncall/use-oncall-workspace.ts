'use client';

/** Owns on-call workspace state, requests, mutations, and local feedback. */

import { useEffect, useState } from 'react';
import {
  OnCallComplianceCheckSchema,
  OnCallDeploymentSchema,
  OnCallRotationSchema,
  UserProfileSchema,
} from '@cueq/shared';
import type { useTranslations } from 'next-intl';
import { useApiContext } from '../../../lib/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../lib/mutation-refresh';
import type {
  ComplianceResult,
  MeResponse,
  OnCallDeployment,
  OnCallRotation,
} from './oncall-types';

const APPROVAL_ROLES = new Set(['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN']);

type TranslationFn = ReturnType<typeof useTranslations>;

/** Provides the state and actions consumed by the on-call route composition. */
export function useOnCallWorkspace(t: TranslationFn) {
  const { token, apiRequest } = useApiContext();

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

    const next = await apiRequest('/v1/me', UserProfileSchema);
    setMe(next);
    return next;
  }

  useEffect(() => {
    setMe(null);
    if (!token) {
      return;
    }

    let active = true;
    void apiRequest('/v1/me', UserProfileSchema)
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

  async function loadOnCallData<T>(
    request: () => Promise<T>,
    apply: (data: T) => void,
    preserveFeedback = false,
  ): Promise<RefreshResult> {
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(request, apply);
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      setLoading(false);
    }
  }

  async function loadRotations(preserveFeedback = false): Promise<RefreshResult> {
    return loadOnCallData(
      () => apiRequest('/v1/oncall/rotations', OnCallRotationSchema.array()),
      setRotations,
      preserveFeedback,
    );
  }

  async function loadDeployments(preserveFeedback = false): Promise<RefreshResult> {
    return loadOnCallData(
      () => apiRequest('/v1/oncall/deployments', OnCallDeploymentSchema.array()),
      setDeployments,
      preserveFeedback,
    );
  }

  async function runCompliance() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const current = await resolveMe();
      const targetPersonId = personId || current.id;
      const data = await apiRequest(
        `/v1/oncall/compliance?personId=${encodeURIComponent(targetPersonId)}&nextShiftStart=${encodeURIComponent(nextShiftStart)}`,
        OnCallComplianceCheckSchema,
      );
      setCompliance(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function runSavedAction(
    mutate: () => Promise<unknown>,
    refresh: () => Promise<RefreshResult>,
    successMessage: string,
  ) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await refreshAfterMutation(mutate, refresh);
      if (result.ok) {
        setMessage(successMessage);
      } else {
        setError(t('savedRefreshFailed'));
      }
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

    await runSavedAction(
      () =>
        apiRequest('/v1/oncall/rotations', OnCallRotationSchema, {
          method: 'POST',
          body: JSON.stringify({
            personId,
            organizationUnitId,
            startTime,
            endTime,
            rotationType,
            note: note || undefined,
          }),
        }),
      () => loadRotations(true),
      t('rotationCreated'),
    );
  }

  async function updateRotation() {
    if (!updateRotationId) {
      setError(t('updateRotationIdRequired'));
      return;
    }

    await runSavedAction(
      () =>
        apiRequest(`/v1/oncall/rotations/${updateRotationId}`, OnCallRotationSchema, {
          method: 'PATCH',
          body: JSON.stringify({ startTime, endTime, rotationType, note: note || undefined }),
        }),
      () => loadRotations(true),
      t('rotationUpdated'),
    );
  }

  async function createDeployment() {
    if (!personId || !rotationId) {
      setError(t('deploymentMissingFields'));
      return;
    }

    await runSavedAction(
      () =>
        apiRequest('/v1/oncall/deployments', OnCallDeploymentSchema, {
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
        }),
      () => loadDeployments(true),
      t('deploymentCreated'),
    );
  }

  return {
    loading,
    message,
    error,
    rotations,
    deployments,
    compliance,
    canManageRotations: me ? APPROVAL_ROLES.has(me.role) : false,
    personId,
    organizationUnitId,
    rotationId,
    startTime,
    endTime,
    rotationType,
    note,
    ticketReference,
    eventReference,
    description,
    remote,
    nextShiftStart,
    updateRotationId,
    setPersonId,
    setOrganizationUnitId,
    setRotationId,
    setStartTime,
    setEndTime,
    setRotationType,
    setNote,
    setTicketReference,
    setEventReference,
    setDescription,
    setRemote,
    setNextShiftStart,
    setUpdateRotationId,
    loadRotations,
    loadDeployments,
    runCompliance,
    createRotation,
    updateRotation,
    createDeployment,
  };
}
