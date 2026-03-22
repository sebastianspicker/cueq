import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter';
import { SEED_IDS, buildMockToken } from '../../test-utils/seed-ids';

describe('MockIdentityProviderAdapter', () => {
  const adapter = new MockIdentityProviderAdapter();

  describe('named tokens', () => {
    it('resolves employee-token to EMPLOYEE identity', async () => {
      const identity = await adapter.verifyAccessToken('employee-token');
      expect(identity.subject).toBe(SEED_IDS.personEmployee);
      expect(identity.email).toBe('employee@cueq.local');
      expect(identity.role).toBe('EMPLOYEE');
    });

    it('resolves hr-token to HR identity', async () => {
      const identity = await adapter.verifyAccessToken('hr-token');
      expect(identity.subject).toBe(SEED_IDS.personHr);
      expect(identity.email).toBe('hr@cueq.local');
      expect(identity.role).toBe('HR');
    });

    it('resolves admin-token to ADMIN identity', async () => {
      const identity = await adapter.verifyAccessToken('admin-token');
      expect(identity.subject).toBe(SEED_IDS.personAdmin);
      expect(identity.email).toBe('admin@cueq.local');
      expect(identity.role).toBe('ADMIN');
    });

    it('resolves lead-token to TEAM_LEAD identity', async () => {
      const identity = await adapter.verifyAccessToken('lead-token');
      expect(identity.role).toBe('TEAM_LEAD');
    });

    it('resolves planner-token to SHIFT_PLANNER identity', async () => {
      const identity = await adapter.verifyAccessToken('planner-token');
      expect(identity.role).toBe('SHIFT_PLANNER');
    });
  });

  describe('encoded tokens', () => {
    it('parses a base64url-encoded JSON payload', async () => {
      const token = buildMockToken({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'HR',
      });

      const identity = await adapter.verifyAccessToken(token);
      expect(identity.subject).toBe('user-123');
      expect(identity.email).toBe('test@example.com');
      expect(identity.role).toBe('HR');
    });

    it('defaults role to EMPLOYEE when not provided', async () => {
      const token = buildMockToken({
        sub: 'user-456',
        email: 'default@example.com',
      });

      const identity = await adapter.verifyAccessToken(token);
      expect(identity.role).toBe('EMPLOYEE');
    });

    it('includes organizationUnitId when present in claims', async () => {
      const token = buildMockToken({
        sub: 'user-789',
        email: 'org@example.com',
        role: 'ADMIN',
        organizationUnitId: 'ou-001',
      });

      const identity = await adapter.verifyAccessToken(token);
      expect(identity.organizationUnitId).toBe('ou-001');
    });

    it('preserves raw claims on the identity object', async () => {
      const token = buildMockToken({
        sub: 'user-abc',
        email: 'claims@example.com',
        role: 'EMPLOYEE',
        customField: 'custom-value',
      });

      const identity = await adapter.verifyAccessToken(token);
      expect(identity.claims).toMatchObject({
        sub: 'user-abc',
        email: 'claims@example.com',
        customField: 'custom-value',
      });
    });
  });

  describe('error paths', () => {
    it('rejects token not starting with mock.', async () => {
      await expect(adapter.verifyAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects malformed base64 payload', async () => {
      await expect(adapter.verifyAccessToken('mock.!!!not-base64')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects unsupported role claim', async () => {
      const token = buildMockToken({
        sub: 'user-bad',
        email: 'bad@example.com',
        role: 'NONEXISTENT_ROLE',
      });

      await expect(adapter.verifyAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects token missing sub claim', async () => {
      const token = buildMockToken({
        email: 'nosub@example.com',
        role: 'EMPLOYEE',
      });

      await expect(adapter.verifyAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects token missing email claim', async () => {
      const token = buildMockToken({
        sub: 'user-noemail',
        role: 'EMPLOYEE',
      });

      await expect(adapter.verifyAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });
  });
});
