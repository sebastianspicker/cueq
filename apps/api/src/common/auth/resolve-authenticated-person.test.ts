import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { resolveAuthenticatedPerson } from './resolve-authenticated-person';

const identity = {
  subject: 'idp-subject',
  email: 'person@cueq.local',
  role: 'ADMIN',
  organizationUnitId: 'claim-ou',
  claims: {},
} as const;

function person(id: string, externalId: string | null = null) {
  return {
    id,
    externalId,
    email: 'person@cueq.local',
    role: 'EMPLOYEE',
    organizationUnitId: 'persisted-ou',
  };
}

describe('resolveAuthenticatedPerson', () => {
  it('uses a deterministic id, external id, then email lookup order', async () => {
    const persisted = person('person-1', 'idp-subject');
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(persisted);

    await expect(
      resolveAuthenticatedPerson({ person: { findUnique } } as never, identity as never),
    ).resolves.toBe(persisted);
    expect(findUnique.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'idp-subject' },
      { externalId: 'idp-subject' },
    ]);
  });

  it('does not allow a role or organization-unit claim to override persisted authority', async () => {
    const persisted = person('idp-subject');
    const findUnique = vi.fn().mockResolvedValueOnce(persisted);

    const resolved = await resolveAuthenticatedPerson(
      { person: { findUnique } } as never,
      identity as never,
    );

    expect(resolved).toMatchObject({ role: 'EMPLOYEE', organizationUnitId: 'persisted-ou' });
  });

  it('rejects an identity-key match with a different claimed email', async () => {
    const persisted = { ...person('idp-subject'), email: 'other@cueq.local' };
    const findUnique = vi.fn().mockResolvedValueOnce(persisted);

    await expect(
      resolveAuthenticatedPerson({ person: { findUnique } } as never, identity as never),
    ).rejects.toThrowError(ForbiddenException);
  });
});
