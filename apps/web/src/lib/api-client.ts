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

function buildHeaders(token: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const hasBody = init?.body !== undefined && init.body !== null;
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

export function createApiRequest(
  baseUrl: string,
  token: string,
  defaultMessage: string,
): ApiRequest {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  return async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(token, init),
    });

    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        `${response.status}: ${text || defaultMessage}`,
        payload,
      );
    }

    if (!text) {
      return null as T;
    }

    return (payload as T) ?? (null as T);
  };
}
