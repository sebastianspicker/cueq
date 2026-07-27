import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimeThresholdPolicyHelper } from '../time-threshold-policy.helper.js';

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
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      timeThresholdPolicy: {
        findMany: vi.fn().mockResolvedValue(policy ? [policy] : []),
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

const makeAuditHelper = () => ({ appendAudit: vi.fn().mockResolvedValue(undefined) });

describe('TimeThresholdPolicyHelper', () => {
  let helper: TimeThresholdPolicyHelper;

  describe('getActiveThresholds', () => {
    it('returns statutory ArbZG defaults when no policy row exists', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never, makeAuditHelper() as never);
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
        makeAuditHelper() as never,
      );
      const result = await helper.getActiveThresholds();
      expect(result.dailyMaxMinutes).toBe(480);
      expect(result.minRestMinutes).toBe(720);
    });

    it('dailyMaxMinutes default is 600 (10 h per ArbZG §3)', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never, makeAuditHelper() as never);
      const { dailyMaxMinutes } = await helper.getActiveThresholds();
      expect(dailyMaxMinutes).toBe(10 * 60);
    });

    it('minRestMinutes default is 660 (11 h per ArbZG §5)', async () => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never, makeAuditHelper() as never);
      const { minRestMinutes } = await helper.getActiveThresholds();
      expect(minRestMinutes).toBe(11 * 60);
    });
  });

  describe('upsertThresholds', () => {
    beforeEach(() => {
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never, makeAuditHelper() as never);
    });

    it('returns the new thresholds after upsert', async () => {
      const result = await helper.upsertThresholds(540, 720, 'actor-1');
      expect(result.dailyMaxMinutes).toBe(540);
      expect(result.minRestMinutes).toBe(720);
    });

    it('runs within a transaction', async () => {
      const prisma = makePrisma(null);
      helper = new TimeThresholdPolicyHelper(prisma as never, makeAuditHelper() as never);
      await helper.upsertThresholds(600, 660, 'actor-1');
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('records the acting identity in the same transaction as the new version', async () => {
      const auditHelper = makeAuditHelper();
      helper = new TimeThresholdPolicyHelper(makePrisma(null) as never, auditHelper as never);

      await helper.upsertThresholds(600, 660, 'person-1');

      expect(auditHelper.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'person-1',
          action: 'TIME_THRESHOLD_POLICY_UPDATED',
          entityType: 'TimeThresholdPolicy',
        }),
        expect.anything(),
      );
    });
  });
});
