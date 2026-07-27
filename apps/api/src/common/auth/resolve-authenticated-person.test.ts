import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { resolveAuthenticatedPerson } from './resolve-authenticated-person.js';

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
  it('uses a deterministic id then external-id lookup order', async () => {
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

  it('does not bind an unknown subject to a privileged person by email', async () => {
    const privilegedPerson = {
      ...person('admin-person', 'admin-external-id'),
      email: identity.email,
      role: 'ADMIN',
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(privilegedPerson);

    await expect(
      resolveAuthenticatedPerson({ person: { findUnique } } as never, identity as never),
    ).rejects.toThrowError(NotFoundException);
    expect(findUnique.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'idp-subject' },
      { externalId: 'idp-subject' },
    ]);
  });
});
