import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postWebhook } from './webhook-http-client.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));

const lookupMock = vi.mocked(lookup);
const httpRequestMock = vi.mocked(requestHttp);
const httpsRequestMock = vi.mocked(requestHttps);

interface FakeResponseOptions {
  status: number;
  headers?: Record<string, string>;
  chunks?: Array<string | Buffer>;
}

function queueResponse(
  requestMock: typeof httpsRequestMock,
  options: FakeResponseOptions,
): { destroy: ReturnType<typeof vi.fn> } {
  const destroy = vi.fn();
  requestMock.mockImplementationOnce(((
    _url: unknown,
    _requestOptions: unknown,
    callback: ((response: IncomingMessage) => void) | undefined,
  ) => {
    const request = new EventEmitter() as EventEmitter & {
      end: (body: string) => void;
      destroy: (error?: Error) => void;
    };
    request.end = vi.fn(() => {
      queueMicrotask(() => {
        const response = Readable.from(options.chunks ?? ['ok']) as Readable & {
          statusCode: number;
          headers: Record<string, string>;
        };
        response.statusCode = options.status;
        response.headers = options.headers ?? {};
        callback?.(response as never);
        response.once('end', () => request.emit('close'));
      });
    });
    request.destroy = destroy.mockImplementation((error?: Error) => {
      if (error) {
        request.emit('error', error);
      }
      request.emit('close');
    });
    return request;
  }) as never);
  return { destroy };
}

function queueNoResponse(requestMock: typeof httpsRequestMock) {
  const destroy = vi.fn();
  requestMock.mockImplementationOnce((() => {
    const request = new EventEmitter() as EventEmitter & {
      end: (body: string) => void;
      destroy: (error?: Error) => void;
    };
    request.end = vi.fn();
    request.destroy = destroy.mockImplementation((error?: Error) => {
      if (error) {
        request.emit('error', error);
      }
    });
    return request;
  }) as never);
  return destroy;
}

function requestInput(overrides: Partial<Parameters<typeof postWebhook>[0]> = {}) {
  return {
    url: 'https://receiver.example/hook',
    headers: { 'X-Cueq-Signature': 'sha256=test-signature' },
    body: '{"eventId":"event-1"}',
    timeoutMs: 1_000,
    maxResponseBytes: 8_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('postWebhook', () => {
  it('connects to a pinned vetted address while preserving Host and TLS SNI', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    queueResponse(httpsRequestMock, { status: 204, chunks: [] });

    await expect(postWebhook(requestInput())).resolves.toEqual({ status: 204, body: '' });

    const [, options] = httpsRequestMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      method: 'POST',
      servername: 'receiver.example',
      headers: {
        Host: 'receiver.example',
        'X-Cueq-Signature': 'sha256=test-signature',
      },
    });
    const callback = vi.fn();
    (options?.lookup as never as Function)('receiver.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it('revalidates and rejects a redirect whose DNS includes a private address', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      .mockResolvedValueOnce([
        { address: '93.184.216.35', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ] as never);
    queueResponse(httpsRequestMock, {
      status: 307,
      headers: { location: 'https://redirect.example/hook' },
      chunks: [],
    });

    await expect(postWebhook(requestInput())).rejects.toThrow(
      'Webhook target must resolve only to public network addresses.',
    );
    expect(httpsRequestMock).toHaveBeenCalledOnce();
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it('destroys the request when the response exceeds the byte limit', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const request = queueResponse(httpsRequestMock, {
      status: 200,
      chunks: [Buffer.alloc(9)],
    });

    await expect(postWebhook(requestInput({ maxResponseBytes: 8 }))).rejects.toThrow(
      'Webhook response exceeded the byte limit.',
    );
    expect(request.destroy).toHaveBeenCalled();
  });

  it('destroys a request that exceeds the total timeout', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const destroy = queueNoResponse(httpsRequestMock);

    await expect(postWebhook(requestInput({ timeoutMs: 5 }))).rejects.toThrow(
      'Webhook request timed out.',
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('fails after the configured redirect limit', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    queueResponse(httpsRequestMock, {
      status: 302,
      headers: { location: '/again' },
      chunks: [],
    });

    await expect(postWebhook(requestInput({ maxRedirects: 0 }))).rejects.toThrow(
      'Webhook redirect limit exceeded.',
    );
  });
});
