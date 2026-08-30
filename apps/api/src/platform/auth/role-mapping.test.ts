import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter.js';
import { parseRoleClaim, selectHighestRoleClaim } from './role-mapping.js';

describe('identity claim normalization', () => {
  it('normalizes trusted role spellings and selects the highest recognized role', () => {
    expect(parseRoleClaim(' Team-Lead ')).toBe('TEAM_LEAD');
    expect(parseRoleClaim('unknown')).toBeNull();
    expect(selectHighestRoleClaim(['employee', 'not-a-role', 'HR', 'admin'])).toBe('ADMIN');
    expect(selectHighestRoleClaim(['not-a-role'])).toBeNull();
  });

  it('decodes only complete mock identities and applies the same role policy', async () => {
    const provider = new MockIdentityProviderAdapter();
    await expect(provider.verifyAccessToken('admin-token')).resolves.toMatchObject({
      role: 'ADMIN',
      email: expect.stringContaining('@'),
    });

    const encoded = Buffer.from(
      JSON.stringify({ sub: 'subject-1', email: 'person@example.test', role: 'team lead' }),
    ).toString('base64url');
    await expect(provider.verifyAccessToken(`mock.${encoded}`)).resolves.toMatchObject({
      subject: 'subject-1',
      role: 'TEAM_LEAD',
    });
    await expect(provider.verifyAccessToken('mock.not-json')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
