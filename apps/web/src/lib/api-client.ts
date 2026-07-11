export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SAFE_RELATIVE_URL_PATTERN = /^\/(?!\/)[^\\\u0000-\u001f\u007f]*$/u;

class ApiRequestBoundary {
  static buildHeaders(token: string, init?: RequestInit): Headers {
    const headers = new Headers(init ? init.headers : undefined);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (init?.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  static assertBaseUrl(baseUrl: string): void {
    if (SAFE_RELATIVE_URL_PATTERN.test(baseUrl)) {
      return;
    }
    if (CONTROL_CHARACTER_PATTERN.test(baseUrl) || baseUrl.includes('\\')) {
      throw new Error('Unsafe API base URL.');
    }

    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error('Unsafe API base URL.');
    }
    if (
      typeof window === 'undefined' ||
      url.origin !== window.location.origin ||
      Boolean(url.username) ||
      Boolean(url.password)
    ) {
      throw new Error('Unsafe API base URL.');
    }
  }

  static assertPath(path: string): void {
    if (!SAFE_RELATIVE_URL_PATTERN.test(path)) {
      throw new Error('Unsafe API request path.');
    }
  }

  static errorMessage(payload: unknown, rawText: string, fallback: string): string {
    const message =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'message') : null;
    return typeof message === 'string' ? message : rawText || fallback;
  }
}

export function createApiRequest(
  baseUrl: string,
  token: string,
  defaultMessage: string,
): ApiRequest {
  const normalizedBaseUrl = (baseUrl || '/api').replace(/\/$/, '');

  return async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    ApiRequestBoundary.assertBaseUrl(normalizedBaseUrl);
    ApiRequestBoundary.assertPath(path);

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: ApiRequestBoundary.buildHeaders(token, init),
    });

    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok) {
      const userMessage = ApiRequestBoundary.errorMessage(payload, text, defaultMessage);
      throw new ApiRequestError(response.status, `${response.status}: ${userMessage}`, payload);
    }

    if (!text) {
      return null as T;
    }

    return (payload as T) ?? (null as T);
  };
}
