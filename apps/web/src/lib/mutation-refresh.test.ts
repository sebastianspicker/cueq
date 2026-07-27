import { describe, expect, it, vi } from 'vitest';
import { loadAndApply, refreshAfterMutation, type RefreshResult } from './mutation-refresh';

describe('loadAndApply', () => {
  it('applies resolved data and reports success', async () => {
    const apply = vi.fn<(data: string) => void>();

    await expect(loadAndApply(() => Promise.resolve('loaded'), apply)).resolves.toEqual({
      ok: true,
    });
    expect(apply).toHaveBeenCalledWith('loaded');
  });

  it('preserves a request failure without applying data', async () => {
    const cause = new Error('request unavailable');
    const apply = vi.fn<(data: string) => void>();

    await expect(loadAndApply(() => Promise.reject(cause), apply)).resolves.toEqual({
      ok: false,
      cause,
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('preserves an apply failure', async () => {
    const cause = new Error('state rejected');

    await expect(
      loadAndApply(
        () => Promise.resolve('loaded'),
        () => {
          throw cause;
        },
      ),
    ).resolves.toEqual({ ok: false, cause });
  });
});

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
