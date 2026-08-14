import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiContext } from '../../../lib/api-context';
import { useApprovalsWorkspace } from './use-approvals-workspace';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../../lib/api-context', () => ({ useApiContext: vi.fn() }));

const workflow = (id: string, availableActions: string[] = ['APPROVE']) => ({
  id,
  type: 'LEAVE_REQUEST',
  status: 'PENDING',
  requesterId: 'c000000000000000000000001',
  approverId: 'c000000000000000000000002',
  reason: null,
  isOverdue: false,
  availableActions,
});

describe('useApprovalsWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('constructs inbox filters in order and invalidates a missing selected workflow', async () => {
    const selected = workflow('workflow-1');
    const apiRequest = vi.fn().mockResolvedValueOnce(selected).mockResolvedValueOnce([]);
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useApprovalsWorkspace());

    await act(async () => {
      await result.current.loadDetail(selected.id);
    });
    expect(result.current.selectedId).toBe(selected.id);

    act(() => {
      result.current.setStatusFilter('PENDING');
      result.current.setTypeFilter('LEAVE_REQUEST');
      result.current.setOverdueOnly(true);
    });
    await act(async () => {
      await result.current.loadInbox();
    });

    expect(apiRequest.mock.calls[1]?.[0]).toBe(
      '/v1/workflows/inbox?status=PENDING&type=LEAVE_REQUEST&overdueOnly=true',
    );
    expect(result.current.selectedId).toBeNull();
    expect(result.current.detail).toBeNull();
  });

  it('posts the selected action and refreshes inbox and detail together after a successful mutation', async () => {
    const selected = workflow('workflow-1', ['DELEGATE']);
    const refreshed = workflow('workflow-1', ['APPROVE']);
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce({ id: selected.id })
      .mockResolvedValueOnce([refreshed])
      .mockResolvedValueOnce(refreshed);
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useApprovalsWorkspace());

    await act(async () => {
      await result.current.loadDetail(selected.id);
    });
    act(() => {
      result.current.setReason('Delegation coverage');
      result.current.setDelegateToId('c000000000000000000000003');
    });
    await act(async () => {
      await result.current.applyAction();
    });

    expect(apiRequest.mock.calls[1]).toEqual([
      '/v1/workflows/workflow-1/decision',
      expect.anything(),
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'DELEGATE',
          reason: 'Delegation coverage',
          delegateToId: 'c000000000000000000000003',
        }),
      },
    ]);
    expect(apiRequest.mock.calls.slice(2).map((call) => call[0])).toEqual([
      '/v1/workflows/inbox',
      '/v1/workflows/workflow-1',
    ]);
    expect(result.current.message).toBe('actionApplied');
    expect(result.current.error).toBeNull();
  });

  it('keeps a successful write visible as refresh feedback when either concurrent refresh fails', async () => {
    const selected = workflow('workflow-1');
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce({ id: selected.id })
      .mockRejectedValueOnce(new Error('inbox unavailable'))
      .mockResolvedValueOnce(selected);
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useApprovalsWorkspace());

    await act(async () => {
      await result.current.loadDetail(selected.id);
    });
    await act(async () => {
      await result.current.applyAction();
    });

    expect(result.current.message).toBeNull();
    expect(result.current.error).toBe('savedRefreshFailed');
    expect(result.current.loading).toBe(false);
  });
});
