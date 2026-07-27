/** AES-GCM envelope boundary for webhook signing secrets, binding ciphertext to its endpoint identifier. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 'v1';
const AES_256_GCM_IV_BYTES = 12;
const AES_256_GCM_TAG_BYTES = 16;
const WEBHOOK_SECRET_KEY_ENV = 'WEBHOOK_SECRET_ENCRYPTION_KEY';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** @internal Non-specific error used by focused secret-envelope tests. */
export class WebhookSecretEnvelopeError extends Error {
  constructor() {
    super('Webhook signing secret unavailable.');
  }
}

function decodeBase64(value: string): Buffer {
  if (!BASE64_PATTERN.test(value)) {
    throw new WebhookSecretEnvelopeError();
  }
  return Buffer.from(value, 'base64');
}

function encryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const configured = env[WEBHOOK_SECRET_KEY_ENV]?.trim();
  if (!configured) {
    throw new WebhookSecretEnvelopeError();
  }

  const key = decodeBase64(configured);
  if (key.length !== 32 || key.toString('base64') !== configured) {
    throw new WebhookSecretEnvelopeError();
  }
  return key;
}

/** Validates encryption-key configuration before startup or migration work proceeds. */
export function assertWebhookSecretEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  encryptionKey(env);
}

/** Encrypts a signing secret with endpoint-bound authenticated encryption. */
export function encryptWebhookSigningSecret(
  signingSecret: string,
  endpointId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  try {
    const iv = randomBytes(AES_256_GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
    cipher.setAAD(Buffer.from(endpointId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(signingSecret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      ENVELOPE_VERSION,
      iv.toString('base64'),
      ciphertext.toString('base64'),
      tag.toString('base64'),
    ].join('.');
  } catch (error) {
    if (error instanceof WebhookSecretEnvelopeError) {
      throw error;
    }
    throw new WebhookSecretEnvelopeError();
  }
}

/** Decrypts only structurally valid endpoint-bound envelopes, collapsing crypto failures to one error. */
export function decryptWebhookSigningSecret(
  envelope: string,
  endpointId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  try {
    const [version, ivText, ciphertextText, tagText, ...unexpectedParts] = envelope.split('.');
    if (
      version !== ENVELOPE_VERSION ||
      unexpectedParts.length !== 0 ||
      !ivText ||
      !ciphertextText ||
      !tagText
    ) {
      throw new WebhookSecretEnvelopeError();
    }

    const iv = decodeBase64(ivText);
    const ciphertext = decodeBase64(ciphertextText);
    const tag = decodeBase64(tagText);
    if (
      iv.length !== AES_256_GCM_IV_BYTES ||
      ciphertext.length === 0 ||
      tag.length !== AES_256_GCM_TAG_BYTES
    ) {
      throw new WebhookSecretEnvelopeError();
    }

    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), iv);
    decipher.setAAD(Buffer.from(endpointId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof WebhookSecretEnvelopeError) {
      throw error;
    }
    throw new WebhookSecretEnvelopeError();
  }
}
