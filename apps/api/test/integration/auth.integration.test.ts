import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';

describe('Phase 2 integration: auth and identity', () => {
  let app: INestApplication;

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated access to /v1/me', async () => {
    const response = await request(app.getHttpServer()).get('/v1/me');
    expect(response.status).toBe(401);
  });

  it('returns authenticated identity for mock token', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('EMPLOYEE');
    expect(response.body.email).toBe('employee@cueq.local');
  });
});

describe('Phase 3 integration: SAML auth provider adapter', () => {
  let app: INestApplication;
  const originalAuthProvider = process.env.AUTH_PROVIDER;
  const originalSamlIssuer = process.env.SAML_ISSUER;
  const originalSamlAudience = process.env.SAML_AUDIENCE;
  const originalSamlSecret = process.env.SAML_JWT_SECRET;

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  }

  async function buildSamlToken(input: {
    sub: string;
    email: string;
    role: string;
    organizationUnitId: string;
    issuer?: string;
    audience?: string;
    secret?: string;
  }) {
    return new SignJWT({
      email: input.email,
      role: input.role,
      organizationUnitId: input.organizationUnitId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer(input.issuer ?? process.env.SAML_ISSUER ?? 'https://saml-idp.cueq.local')
      .setAudience(input.audience ?? process.env.SAML_AUDIENCE ?? 'cueq-api')
      .setSubject(input.sub)
      .sign(
        new TextEncoder().encode(
          input.secret ?? process.env.SAML_JWT_SECRET ?? 'dev-saml-shared-secret',
        ),
      );
  }

  beforeAll(async () => {
    seedPhase2Data();
    process.env.AUTH_PROVIDER = 'saml';
    process.env.SAML_ISSUER = 'https://saml-idp.cueq.local';
    process.env.SAML_AUDIENCE = 'cueq-api';
    process.env.SAML_JWT_SECRET = 'dev-saml-shared-secret';
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    restoreEnv('AUTH_PROVIDER', originalAuthProvider);
    restoreEnv('SAML_ISSUER', originalSamlIssuer);
    restoreEnv('SAML_AUDIENCE', originalSamlAudience);
    restoreEnv('SAML_JWT_SECRET', originalSamlSecret);
  });

  it('maps valid SAML provider token to authenticated identity', async () => {
    const token = await buildSamlToken({
      sub: 'c000000000000000000000104',
      email: 'admin@cueq.local',
      role: 'admin',
      organizationUnitId: 'c000000000000000000000001',
    });

    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('ADMIN');
    expect(response.body.email).toBe('admin@cueq.local');
  });

  it('rejects invalid SAML issuer/audience/signature claims', async () => {
    const wrongIssuer = await buildSamlToken({
      sub: 'c000000000000000000000104',
      email: 'admin@cueq.local',
      role: 'admin',
      organizationUnitId: 'c000000000000000000000001',
      issuer: 'https://malicious-idp.example',
    });
    const wrongAudience = await buildSamlToken({
      sub: 'c000000000000000000000104',
      email: 'admin@cueq.local',
      role: 'admin',
      organizationUnitId: 'c000000000000000000000001',
      audience: 'wrong-audience',
    });
    const wrongSignature = await buildSamlToken({
      sub: 'c000000000000000000000104',
      email: 'admin@cueq.local',
      role: 'admin',
      organizationUnitId: 'c000000000000000000000001',
      secret: 'wrong-secret',
    });

    const issuerResponse = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${wrongIssuer}`);
    const audienceResponse = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${wrongAudience}`);
    const signatureResponse = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${wrongSignature}`);

    expect(issuerResponse.status).toBe(401);
    expect(audienceResponse.status).toBe(401);
    expect(signatureResponse.status).toBe(401);
  });
});
