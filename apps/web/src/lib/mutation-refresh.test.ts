import { describe, expect, it, vi } from 'vitest';
import { refreshAfterMutation, type RefreshResult } from './mutation-refresh';

describe('refreshAfterMutation', () => {
  it('reports a refreshed result after both operations succeed', async () => {
    const mutate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const refresh = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: true });

    await expect(refreshAfterMutation(mutate, refresh)).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('preserves a successful mutation when the refresh reports failure', async () => {
    const mutate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const cause = new Error('refresh unavailable');
    const refresh = vi.fn<() => Promise<RefreshResult>>().mockResolvedValue({ ok: false, cause });

    await expect(refreshAfterMutation(mutate, refresh)).resolves.toEqual({ ok: false, cause });
  });

  it('does not refresh when the mutation fails', async () => {
    const mutationError = new Error('mutation rejected');
    const mutate = vi.fn<() => Promise<void>>().mockRejectedValue(mutationError);
    const refresh = vi.fn<() => Promise<RefreshResult>>();

    await expect(refreshAfterMutation(mutate, refresh)).rejects.toBe(mutationError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
