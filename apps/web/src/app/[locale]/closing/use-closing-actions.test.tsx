import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RefreshResult } from '../../../lib/mutation-refresh';
import { useClosingActions } from './use-closing-actions';

const t = ((key: string) => key) as never;
const closingPeriod = {
  id: 'period-1',
  organizationUnitId: 'organization-1',
  periodStart: '2026-03-01T00:00:00.000Z',
  periodEnd: '2026-03-31T23:59:59.000Z',
  status: 'REVIEW',
  exportRuns: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useClosingActions', () => {
  it.each([
    ['lead-approve', undefined],
    ['approve', undefined],
    ['export', { format: 'XML_V1' }],
    ['reopen', undefined],
  ] as const)('posts the exact %s period-action payload', async (action, body) => {
    const apiRequest = vi.fn().mockResolvedValue({ id: closingPeriod.id });
    const reload = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useClosingActions(t, apiRequest as never, closingPeriod, reload),
    );

    await act(async () => {
      await result.current.runPeriodAction(action, body);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      `/v1/closing-periods/${closingPeriod.id}/${action}`,
      expect.anything(),
      { method: 'POST', body: body ? JSON.stringify(body) : undefined },
    );
    expect(reload).toHaveBeenCalledWith(true);
    expect(result.current.message).toBe('actionApplied');
  });

  it('propagates a post-close workflow ID and preserves exact workflow and correction payloads', async () => {
    const workflowId = 'workflow-2';
    const correctionPayload = {
      workflowId,
      personId: 'person-1',
      timeTypeId: 'time-type-1',
      startTime: '2026-03-10T09:00:00.000Z',
      endTime: '2026-03-10T11:00:00.000Z',
      reason: 'Correct the booking',
      note: 'Source record attached',
    };
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({ id: workflowId })
      .mockResolvedValueOnce({ id: workflowId })
      .mockResolvedValueOnce({ id: 'correction-1' });
    const reload = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useClosingActions(t, apiRequest as never, closingPeriod, reload),
    );

    await act(async () => {
      await result.current.runPeriodAction('post-close-corrections', {
        reason: 'Payroll mismatch',
      });
    });
    expect(result.current.workflowId).toBe(workflowId);
    expect(result.current.correctionPayload.workflowId).toBe(workflowId);
    expect(result.current.workflowApproved).toBe(false);

    act(() => {
      result.current.setWorkflowReason('Approved after evidence review');
      result.current.setCorrectionPayload(correctionPayload);
    });
    await act(async () => {
      await result.current.approveWorkflow();
    });
    await act(async () => {
      await result.current.applyCorrection();
    });

    expect(apiRequest.mock.calls[0]).toEqual([
      `/v1/closing-periods/${closingPeriod.id}/post-close-corrections`,
      expect.anything(),
      { method: 'POST', body: JSON.stringify({ reason: 'Payroll mismatch' }) },
    ]);
    expect(apiRequest.mock.calls[1]).toEqual([
      `/v1/workflows/${workflowId}/decision`,
      expect.anything(),
      {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE', reason: 'Approved after evidence review' }),
      },
    ]);
    expect(apiRequest.mock.calls[2]).toEqual([
      `/v1/closing-periods/${closingPeriod.id}/corrections/bookings`,
      expect.anything(),
      { method: 'POST', body: JSON.stringify(correctionPayload) },
    ]);
    expect(result.current.workflowApproved).toBe(true);
    expect(result.current.message).toBe('correctionApplied');
  });

  it('surfaces a failed post-mutation refresh without overwriting it with success feedback', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ id: closingPeriod.id });
    const reload = vi
      .fn<() => Promise<RefreshResult>>()
      .mockResolvedValue({ ok: false, cause: new Error('period list unavailable') });
    const { result } = renderHook(() =>
      useClosingActions(t, apiRequest as never, closingPeriod, reload),
    );

    await act(async () => {
      await result.current.runPeriodAction('reopen');
    });

    expect(result.current.error).toBe('savedRefreshFailed');
    expect(result.current.message).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('preserves request errors and prevents a refresh when the period mutation fails', async () => {
    const apiRequest = vi.fn().mockRejectedValue(new Error('period is locked'));
    const reload = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useClosingActions(t, apiRequest as never, closingPeriod, reload),
    );

    await act(async () => {
      await result.current.runPeriodAction('reopen');
    });

    expect(result.current.error).toBe('period is locked');
    expect(result.current.message).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears normal action feedback before its request but retains it while a correction is pending', async () => {
    const pendingAction = deferred<{ id: string }>();
    const pendingCorrection = deferred<{ id: string }>();
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({ id: closingPeriod.id })
      .mockReturnValueOnce(pendingAction.promise)
      .mockReturnValueOnce(pendingCorrection.promise);
    const reload = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useClosingActions(t, apiRequest as never, closingPeriod, reload),
    );

    await act(async () => {
      await result.current.runPeriodAction('reopen');
    });
    expect(result.current.message).toBe('actionApplied');

    act(() => {
      void result.current.runPeriodAction('approve');
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.message).toBeNull();
    await act(async () => {
      pendingAction.resolve({ id: closingPeriod.id });
      await pendingAction.promise;
    });

    act(() => {
      void result.current.applyCorrection();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.message).toBe('actionApplied');
    await act(async () => {
      pendingCorrection.resolve({ id: 'correction-1' });
      await pendingCorrection.promise;
    });
    expect(result.current.message).toBe('correctionApplied');
  });
});
