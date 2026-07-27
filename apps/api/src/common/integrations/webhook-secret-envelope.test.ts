import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertWebhookSecretEncryptionKey,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
  WebhookSecretEnvelopeError,
} from './webhook-secret-envelope.js';

const KEY = Buffer.alloc(32, 9).toString('base64');
const ENV = { WEBHOOK_SECRET_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
const SECRET = randomBytes(32).toString('hex');

describe('webhook signing-secret envelope', () => {
  it('uses a fresh AES-GCM nonce and never stores the returned secret verbatim', () => {
    const first = encryptWebhookSigningSecret(SECRET, 'endpoint-1', ENV);
    const second = encryptWebhookSigningSecret(SECRET, 'endpoint-1', ENV);

    expect(first).toMatch(/^v1\./u);
    expect(second).toMatch(/^v1\./u);
    expect(first).not.toBe(second);
    expect(first).not.toContain(SECRET);
    expect(decryptWebhookSigningSecret(first, 'endpoint-1', ENV)).toBe(SECRET);
  });

  it('rejects tampered envelopes and endpoint-bound ciphertext used for another endpoint', () => {
    const envelope = encryptWebhookSigningSecret(SECRET, 'endpoint-1', ENV);
    const tampered = `${envelope.slice(0, -1)}${envelope.endsWith('A') ? 'B' : 'A'}`;

    expect(() => decryptWebhookSigningSecret(tampered, 'endpoint-1', ENV)).toThrow(
      WebhookSecretEnvelopeError,
    );
    expect(() => decryptWebhookSigningSecret(envelope, 'endpoint-2', ENV)).toThrow(
      WebhookSecretEnvelopeError,
    );
  });

  it('rejects a missing or wrong encryption key without exposing key details', () => {
    const envelope = encryptWebhookSigningSecret(SECRET, 'endpoint-1', ENV);

    expect(() => decryptWebhookSigningSecret(envelope, 'endpoint-1', {})).toThrow(
      'Webhook signing secret unavailable.',
    );
    expect(() =>
      decryptWebhookSigningSecret(envelope, 'endpoint-1', {
        WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 10).toString('base64'),
      }),
    ).toThrow('Webhook signing secret unavailable.');
  });

  it('accepts only a canonical 32-byte base64 deployment key', () => {
    expect(() => assertWebhookSecretEncryptionKey(ENV)).not.toThrow();
    expect(() => assertWebhookSecretEncryptionKey({})).toThrow(WebhookSecretEnvelopeError);
    expect(() =>
      assertWebhookSecretEncryptionKey({ WEBHOOK_SECRET_ENCRYPTION_KEY: KEY.replace(/=+$/u, '') }),
    ).toThrow(WebhookSecretEnvelopeError);
    expect(() =>
      assertWebhookSecretEncryptionKey({
        WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64'),
      }),
    ).toThrow(WebhookSecretEnvelopeError);
  });
});
