import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeThresholdPolicyHelper } from '../time-threshold-policy.helper';

const makePrisma = (policy: unknown) => ({
  timeThresholdPolicy: {
    findFirst: vi.fn().mockResolvedValue(policy),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi
      .fn()
      .mockImplementation((args: { data: { dailyMaxMinutes: number; minRestMinutes: number } }) =>
        Promise.resolve({ ...args.data, id: 'new-id', activeFrom: new Date(), activeTo: null }),
      ),
  },
  $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      timeThresholdPolicy: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi
          .fn()
          .mockImplementation(
            (args: { data: { dailyMaxMinutes: number; minRestMinutes: number } }) =>
              Promise.resolve({
                ...args.data,
                id: 'new-id',
                activeFrom: new Date(),
                activeTo: null,
              }),
          ),
      },
    };
    return fn(tx);
  }),
});

describe('TimeThresholdPolicyHelper', () => {
  let helper: TimeThresholdPolicyHelper;

  describe('getActiveThresholds', () => {
    it('returns statutory ArbZG defaults when no policy row exists', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never);
      const result = await helper.getActiveThresholds();
      expect(result.dailyMaxMinutes).toBe(600);
      expect(result.minRestMinutes).toBe(660);
    });

    it('returns thresholds from the active policy row', async () => {
      helper = new TimeThresholdPolicyHelper(
        makePrisma({
          id: 'p1',
          dailyMaxMinutes: 480,
          minRestMinutes: 720,
          activeTo: null,
        }) as never,
      );
      const result = await helper.getActiveThresholds();
      expect(result.dailyMaxMinutes).toBe(480);
      expect(result.minRestMinutes).toBe(720);
    });

    it('dailyMaxMinutes default is 600 (10 h per ArbZG §3)', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never);
      const { dailyMaxMinutes } = await helper.getActiveThresholds();
      expect(dailyMaxMinutes).toBe(10 * 60);
    });

    it('minRestMinutes default is 660 (11 h per ArbZG §5)', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never);
      const { minRestMinutes } = await helper.getActiveThresholds();
      expect(minRestMinutes).toBe(11 * 60);
    });
  });

  describe('upsertThresholds', () => {
    beforeEach(() => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never);
    });

    it('returns the new thresholds after upsert', async () => {
      const result = await helper.upsertThresholds(540, 720);
      expect(result.dailyMaxMinutes).toBe(540);
      expect(result.minRestMinutes).toBe(720);
    });

    it('runs within a transaction', async () => {
      const prisma = makePrisma(null);
      helper = new TimeThresholdPolicyHelper(prisma as never);
      await helper.upsertThresholds(600, 660);
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });
  });
});
