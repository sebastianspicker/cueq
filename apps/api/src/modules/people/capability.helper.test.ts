import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { CapabilityHelper } from './capability.helper.js';

const ids = {
  actor: 'c00000000000000000000401',
  person: 'c00000000000000000000402',
  organization: 'c00000000000000000000403',
};

describe('capability grants', () => {
  it('offers self scope only for the actor and always constrains active, non-revoked grants', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'grant-1' });
    const helper = new CapabilityHelper({
      capabilityGrant: { findFirst },
    } as unknown as PrismaService);

    await expect(helper.allows(ids.actor, 'personnel.read', { personId: ids.actor })).resolves.toBe(
      true,
    );

    const where = findFirst.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({
      granteeId: ids.actor,
      capability: 'personnel.read',
      revokedAt: null,
      activeFrom: { lte: expect.any(Date) },
    });
    expect(where.AND[1].OR).toEqual(
      expect.arrayContaining([
        { scope: 'GLOBAL', targetId: null },
        { scope: 'SELF', targetId: null },
        { scope: 'PERSON', targetId: ids.actor },
      ]),
    );

    findFirst.mockClear();
    await helper.allows(ids.actor, 'personnel.read', { personId: ids.person });
    expect(findFirst.mock.calls[0]?.[0].where.AND[1].OR).not.toContainEqual({
      scope: 'SELF',
      targetId: null,
    });
  });

  it('uses only the supplied verified resource identifiers and rejects absent grants', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const helper = new CapabilityHelper({
      capabilityGrant: { findFirst },
    } as unknown as PrismaService);

    await expect(
      helper.assert(ids.actor, 'personnel.manage', {
        personId: ids.person,
        organizationUnitId: ids.organization,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CAPABILITY_REQUIRED' },
    });
    expect(findFirst.mock.calls[0]?.[0].where.AND[1].OR).toEqual([
      { scope: 'GLOBAL', targetId: null },
      { scope: 'PERSON', targetId: ids.person },
      { scope: 'ORGANIZATION', targetId: ids.organization },
    ]);
  });
});
