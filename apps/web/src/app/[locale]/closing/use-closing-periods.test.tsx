import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useClosingPeriods } from './use-closing-periods';

const t = ((key: string) => key) as never;

const period = (id: string) => ({
  id,
  organizationUnitId: 'organization-1',
  periodStart: '2026-03-01T00:00:00.000Z',
  periodEnd: '2026-03-31T23:59:59.000Z',
  status: 'REVIEW',
  exportRuns: [],
});

const checklist = (closingPeriodId: string) => ({
  closingPeriodId,
  status: 'READY',
  hasErrors: false,
  items: [],
});

describe('useClosingPeriods', () => {
  it('builds the filtered list query and transitions through refreshed, changed, and empty selections', async () => {
    const first = period('period-1');
    const second = period('period-2');
    const replacement = period('period-3');
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(checklist(first.id))
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(checklist(second.id))
      .mockResolvedValueOnce([replacement])
      .mockResolvedValueOnce(replacement)
      .mockResolvedValueOnce(checklist(replacement.id))
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => useClosingPeriods(t, apiRequest as never));

    act(() => {
      result.current.setFromMonth('2026-02');
      result.current.setToMonth('2026-04');
      result.current.setOrganizationUnitId('organization-1');
    });
    await act(async () => {
      await result.current.loadPeriods();
    });

    expect(apiRequest.mock.calls[0]?.[0]).toBe(
      '/v1/closing-periods?from=2026-02&to=2026-04&organizationUnitId=organization-1',
    );
    expect(result.current.period).toEqual(first);
    expect(result.current.checklist).toEqual(checklist(first.id));

    await act(async () => {
      await result.current.selectPeriod(second.id);
    });
    expect(result.current.period).toEqual(second);
    expect(result.current.checklist).toEqual(checklist(second.id));

    await act(async () => {
      await result.current.loadPeriods();
    });
    expect(result.current.period).toEqual(replacement);
    expect(result.current.checklist).toEqual(checklist(replacement.id));

    await act(async () => {
      await result.current.loadPeriods();
    });
    expect(result.current.period).toBeNull();
    expect(result.current.checklist).toBeNull();
  });

  it('returns refresh failures and only clears feedback when requested', async () => {
    const firstFailure = new Error('period list unavailable');
    const preservedFailure = new Error('refresh unavailable');
    const apiRequest = vi
      .fn()
      .mockRejectedValueOnce(firstFailure)
      .mockRejectedValueOnce(preservedFailure);
    const { result } = renderHook(() => useClosingPeriods(t, apiRequest as never));

    await act(async () => {
      await expect(result.current.loadPeriods()).resolves.toEqual({
        ok: false,
        cause: firstFailure,
      });
    });
    expect(result.current.error).toBe('period list unavailable');
    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.setError('existing feedback');
    });
    await act(async () => {
      await expect(result.current.loadPeriods(true)).resolves.toEqual({
        ok: false,
        cause: preservedFailure,
      });
    });
    expect(result.current.error).toBe('existing feedback');
  });
});
