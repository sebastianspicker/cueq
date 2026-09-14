'use client';

import { useEffect, useState } from 'react';
import {
  OnCallComplianceCheckSchema,
  OnCallRotationPageSchema,
  OnCallDeploymentPageSchema,
  OnCallDeploymentSchema,
  OnCallRotationSchema,
  UserProfileSchema,
} from '@cueq/contracts';
import type { useTranslations } from 'next-intl';
import { mergePage, pagePath } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import type { ApiRequest } from '../../../platform/http/api-client';
import { useApiContext } from '../../../platform/http/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../shared/workspace/mutation-refresh';
import type {
  ComplianceResult,
  MeResponse,
  OnCallDeployment,
  OnCallRotation,
} from './oncall-types';

const APPROVAL_ROLES = new Set(['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN']);

type TranslationFn = ReturnType<typeof useTranslations>;

export function useOnCallWorkspace(t: TranslationFn) {
  const { token, apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [rotationsCursor, setRotationsCursor] = useState<string | null>(null);
  const [deploymentsCursor, setDeploymentsCursor] = useState<string | null>(null);
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

  async function resolveMe(request: ApiRequest) {
    if (me) {
      return me;
    }

    const next = await request('/v1/me', UserProfileSchema);
    return next;
  }

  useEffect(() => {
    setMe(null);
    if (!token) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    void apiRequest('/v1/me', UserProfileSchema, { signal: controller.signal })
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
      controller.abort();
    };
  }, [apiRequest, token]);

  async function loadOnCallData<T>(
    resource: string,
    request: (apiRequest: ApiRequest) => Promise<T>,
    apply: (data: T) => void,
    preserveFeedback = false,
  ): Promise<RefreshResult> {
    const read = reads.begin(resource, preserveFeedback);
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(() => request(read.request), apply, read.isCurrent);
      if (!read.isCurrent()) return result;
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function loadRotations(
    preserveFeedback = false,
    cursor?: string | null,
  ): Promise<RefreshResult> {
    return loadOnCallData(
      'rotations',
      (apiRequest) =>
        apiRequest(pagePath('/v1/oncall/rotations', cursor), OnCallRotationPageSchema),
      (page) => {
        setRotations((previous) => (cursor ? mergePage(previous, page.items) : page.items));
        setRotationsCursor(page.nextCursor);
      },
      preserveFeedback,
    );
  }

  async function loadDeployments(
    preserveFeedback = false,
    cursor?: string | null,
  ): Promise<RefreshResult> {
    return loadOnCallData(
      'deployments',
      (apiRequest) =>
        apiRequest(pagePath('/v1/oncall/deployments', cursor), OnCallDeploymentPageSchema),
      (page) => {
        setDeployments((previous) => (cursor ? mergePage(previous, page.items) : page.items));
        setDeploymentsCursor(page.nextCursor);
      },
      preserveFeedback,
    );
  }

  async function runCompliance() {
    const read = reads.begin('compliance');
    const apiRequest = read.request;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const current = await resolveMe(apiRequest);
      const targetPersonId = personId || current.id;
      const data = await apiRequest(
        `/v1/oncall/compliance?personId=${encodeURIComponent(targetPersonId)}&nextShiftStart=${encodeURIComponent(nextShiftStart)}`,
        OnCallComplianceCheckSchema,
      );
      if (read.isCurrent()) setCompliance(data);
    } catch (cause) {
      if (!read.isCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function runSavedAction(
    mutate: () => Promise<unknown>,
    refresh: () => Promise<RefreshResult>,
    successMessage: string,
  ) {
    const operation = reads.begin('mutation');
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await refreshAfterMutation(mutate, refresh, operation.isFeedbackCurrent);
      if (!operation.isFeedbackCurrent()) return;
      if (result.ok) {
        setMessage(successMessage);
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      if (!operation.isFeedbackCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(reads.pending);
      }
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
          body: JSON.stringify({
            assignmentId: rotations.find((rotation) => rotation.id === updateRotationId)
              ?.assignmentId,
            startTime,
            endTime,
            rotationType,
            note: note || undefined,
          }),
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
    rotationsCursor,
    loadMoreRotations: () =>
      rotationsCursor ? loadRotations(false, rotationsCursor) : Promise.resolve(),
    loadDeployments,
    deploymentsCursor,
    loadMoreDeployments: () =>
      deploymentsCursor ? loadDeployments(false, deploymentsCursor) : Promise.resolve(),
    runCompliance,
    createRotation,
    updateRotation,
    createDeployment,
  };
}
