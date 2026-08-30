const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SAFE_RELATIVE_URL_PATTERN = /^\/(?!\/)[^\\\u0000-\u001f\u007f]*$/u;

export function normalizeApiBaseUrl(baseUrl: string): string {
  return (baseUrl || '/api').replace(/\/$/, '');
}

export function buildApiHeaders(token: string, init?: RequestInit): Headers {
  const headers = new Headers(init ? init.headers : undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export function assertSafeApiBaseUrl(baseUrl: string, browserOrigin: string | undefined): void {
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
    browserOrigin === undefined ||
    url.origin !== browserOrigin ||
    Boolean(url.username) ||
    Boolean(url.password)
  ) {
    throw new Error('Unsafe API base URL.');
  }
}

export function assertSafeApiRequestPath(path: string): void {
  if (!SAFE_RELATIVE_URL_PATTERN.test(path)) {
    throw new Error('Unsafe API request path.');
  }
}
