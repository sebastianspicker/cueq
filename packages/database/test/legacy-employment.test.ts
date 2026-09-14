import { describe, expect, it, vi } from 'vitest';
import { reconcileLegacyEmployment } from '../src/legacy-employment.js';

describe('legacy appointment history protection', () => {
  it('rejects a new appointment intersecting a closed population before appointment writes', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'person' }]), $executeRaw: vi.fn() };
    await expect(reconcileLegacyEmployment(tx as never, ['person'])).rejects.toThrow(
      'locked closing population',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('refuses implicit effective configuration changes after bounded initialization', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'person' }]),
      $executeRaw: vi.fn(),
    };
    await expect(reconcileLegacyEmployment(tx as never, ['person'])).rejects.toThrow(
      'explicit dated term',
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
