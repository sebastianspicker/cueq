import { request as requestHttp } from 'node:http';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as requestHttps } from 'node:https';
import { resolveWebhookDispatchTarget } from './webhook-url';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

export interface WebhookHttpResponse {
  status: number;
  body: string;
}

export interface WebhookHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects?: number;
}

function responseBody(
  response: IncomingMessage,
  request: ClientRequest,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    response.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        const error = new Error('Webhook response exceeded the byte limit.');
        response.destroy(error);
        request.destroy(error);
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    response.on('aborted', () => reject(new Error('Webhook response was interrupted.')));
    response.on('error', reject);
  });
}

function redirectLocation(response: IncomingMessage): string | null {
  if (!response.statusCode || !REDIRECT_STATUSES.has(response.statusCode)) {
    return null;
  }

  const location = response.headers.location;
  return typeof location === 'string' && location ? location : null;
}

function pinnedLookup(address: string, family: 4 | 6): RequestOptions['lookup'] {
  return (_hostname, _options, callback) => callback(null, address, family);
}

async function requestOnce(input: WebhookHttpRequest): Promise<{
  response: IncomingMessage;
  request: ClientRequest;
  cancelTimeout: () => void;
}> {
  const target = await resolveWebhookDispatchTarget(input.url);
  const requestFn = target.url.protocol === 'https:' ? requestHttps : requestHttp;

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout;
    const cancelTimeout = () => clearTimeout(timer);
    const request = requestFn(
      target.url,
      {
        method: 'POST',
        headers: { ...input.headers, Host: target.url.host },
        lookup: pinnedLookup(target.address, target.family),
        family: target.family,
        servername: target.url.hostname,
      },
      (response) => resolve({ response, request, cancelTimeout }),
    );
    timer = setTimeout(() => {
      request.destroy(new Error('Webhook request timed out.'));
    }, input.timeoutMs);
    timer.unref();
    request.once('error', (error) => {
      cancelTimeout();
      reject(error);
    });
    request.end(input.body);
  });
}

export async function postWebhook(input: WebhookHttpRequest): Promise<WebhookHttpResponse> {
  const maxRedirects = input.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let destination = input.url;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const { response, request, cancelTimeout } = await requestOnce({
      ...input,
      url: destination,
    });
    const location = redirectLocation(response);
    if (!location) {
      try {
        return {
          status: response.statusCode ?? 0,
          body: await responseBody(response, request, input.maxResponseBytes),
        };
      } finally {
        cancelTimeout();
      }
    }

    cancelTimeout();
    response.destroy();
    request.destroy();
    if (redirects === maxRedirects) {
      request.destroy();
      throw new Error('Webhook redirect limit exceeded.');
    }
    destination = new URL(location, destination).toString();
  }

  throw new Error('Webhook redirect limit exceeded.');
}
