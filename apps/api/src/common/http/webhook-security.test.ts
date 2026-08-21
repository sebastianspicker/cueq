import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from '../integrations/webhook-secret-envelope.js';
import { postWebhook } from './webhook-http-client.js';
import { assertWebhookTargetUrl, resolveWebhookDispatchTarget } from './webhook-url.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));

const lookupMock = vi.mocked(lookup);
const httpsRequestMock = vi.mocked(requestHttps);
const production = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
const key = Buffer.alloc(32, 9).toString('base64');

function queueResponse(status: number, headers: Record<string, string> = {}): void {
  httpsRequestMock.mockImplementationOnce(((
    _url: unknown,
    _options: unknown,
    callback?: (response: IncomingMessage) => void,
  ) => {
    const request = new EventEmitter() as EventEmitter & {
      end: (body: string) => void;
      destroy: () => void;
    };
    request.end = vi.fn(() => {
      const response = Readable.from([]) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = status;
      response.headers = headers;
      callback?.(response as IncomingMessage);
    });
    request.destroy = vi.fn();
    return request;
  }) as never);
}

afterEach(() => {
  lookupMock.mockReset();
  httpsRequestMock.mockReset();
});

describe('webhook security boundaries', () => {
  it('rejects credentialed and private registration targets, plus mixed DNS answers', async () => {
    expect(() => assertWebhookTargetUrl('https://user:pass@example.com/hook', production)).toThrow(
      /must not include user credentials/iu,
    );
    expect(() => assertWebhookTargetUrl('https://127.0.0.1/hook', production)).toThrow(
      /must not target localhost or private network addresses/iu,
    );
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.4', family: 4 },
    ] as never);
    await expect(
      resolveWebhookDispatchTarget('https://receiver.example/hook', production),
    ).rejects.toThrow(/must resolve only to public network addresses/iu);
  });

  it('pins a vetted address and revalidates an upstream redirect', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      .mockResolvedValueOnce([
        { address: '93.184.216.35', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ] as never);
    queueResponse(307, { location: 'https://redirect.example/hook' });

    await expect(
      postWebhook({
        url: 'https://receiver.example/hook',
        headers: { 'X-Cueq-Signature': 'sha256=test' },
        body: '{}',
        timeoutMs: 1_000,
        maxResponseBytes: 1_024,
      }),
    ).rejects.toThrow(/must resolve only to public network addresses/iu);

    const [, options] = httpsRequestMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      servername: 'receiver.example',
      headers: { Host: 'receiver.example', 'X-Cueq-Signature': 'sha256=test' },
    });
    const callback = vi.fn();
    (
      options?.lookup as (
        host: string,
        options: unknown,
        callback: (...args: unknown[]) => void,
      ) => void
    )('receiver.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('keeps AES-GCM failures generic while binding ciphertext to its endpoint', () => {
    const env = { WEBHOOK_SECRET_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv;
    const envelope = encryptWebhookSigningSecret('signing-secret', 'endpoint-a', env);
    expect(decryptWebhookSigningSecret(envelope, 'endpoint-a', env)).toBe('signing-secret');
    const tampered = `${envelope.slice(0, -1)}${envelope.endsWith('A') ? 'B' : 'A'}`;

    for (const [candidate, endpoint, candidateEnv] of [
      [envelope, 'endpoint-b', env],
      [tampered, 'endpoint-a', env],
      [
        envelope,
        'endpoint-a',
        { WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 10).toString('base64') },
      ],
    ] as const) {
      expect(() => decryptWebhookSigningSecret(candidate, endpoint, candidateEnv)).toThrow(
        'Webhook signing secret unavailable.',
      );
    }
  });
});
