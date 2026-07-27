/** API transport boundary that validates URLs, normalizes safe errors, and parses response contracts. */
import { SafeApiErrorPayloadSchema, type SafeApiErrorPayload } from '@cueq/shared';

/** Represents a non-successful API response with its safe, validated payload when available. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: SafeApiErrorPayload | null;

  constructor(status: number, message: string, payload: SafeApiErrorPayload | null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

/** Normalized path and code for a client-visible response-contract failure. */
interface ApiContractIssue {
  code: string;
  path: string;
}

/** Represents malformed JSON or a response that violates the expected client contract. */
/** @internal Exported for focused API-contract failure tests. */
export class ApiContractError extends Error {
  readonly issues: readonly ApiContractIssue[];

  constructor(message: string, issues: readonly ApiContractIssue[] = []) {
    super(message);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}

/** Minimal parser contract accepted from shared runtime schemas. */
export interface ApiResponseSchema<T> {
  parse(input: unknown): T;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiContractError('The API returned malformed JSON.');
  }
}

function contractIssues(error: unknown): ApiContractIssue[] {
  if (typeof error !== 'object' || error === null) {
    return [];
  }
  const rawIssues = Reflect.get(error, 'issues');
  if (!Array.isArray(rawIssues)) {
    return [];
  }

  return rawIssues.slice(0, 20).flatMap((rawIssue): ApiContractIssue[] => {
    if (typeof rawIssue !== 'object' || rawIssue === null) {
      return [];
    }
    const rawCode = Reflect.get(rawIssue, 'code');
    const rawPath = Reflect.get(rawIssue, 'path');
    if (typeof rawCode !== 'string' || !Array.isArray(rawPath)) {
      return [];
    }
    const path = rawPath
      .filter(
        (segment): segment is string | number =>
          typeof segment === 'string' || typeof segment === 'number',
      )
      .map(String)
      .join('.');
    return [{ code: rawCode.slice(0, 100), path: path || '<root>' }];
  });
}

/** Validated API request that parses a successful response through its runtime schema. */
export type ApiRequest = <T>(
  path: string,
  schema: ApiResponseSchema<T>,
  init?: RequestInit,
) => Promise<T>;
/** Raw API fetch boundary for callers that need headers, streams, or non-JSON responses. */
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

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

  static safeErrorPayload(payload: unknown): SafeApiErrorPayload | null {
    const result = SafeApiErrorPayloadSchema.safeParse(payload);
    return result.success ? result.data : null;
  }
}

/** Creates a schema-validating request function; authorization and data visibility remain server concerns. */
export function createApiRequest(
  baseUrl: string,
  token: string,
  defaultMessage: string,
): ApiRequest {
  const apiFetch = createApiFetch(baseUrl, token);

  return async function apiRequest<T>(
    path: string,
    schema: ApiResponseSchema<T>,
    init?: RequestInit,
  ): Promise<T> {
    const response = await apiFetch(path, init);
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = parseJson(text);
      } catch (error) {
        if (response.ok) {
          throw error;
        }
      }
    }

    if (!response.ok) {
      const safePayload = ApiRequestBoundary.safeErrorPayload(payload);
      const userMessage = safePayload?.message ?? defaultMessage;
      throw new ApiRequestError(response.status, `${response.status}: ${userMessage}`, safePayload);
    }

    try {
      return schema.parse(payload);
    } catch (error) {
      throw new ApiContractError(
        'The API returned a response that does not match its contract.',
        contractIssues(error),
      );
    }
  };
}

/** Creates the low-level authenticated fetch wrapper used by client API calls. */
export function createApiFetch(baseUrl: string, token: string): ApiFetch {
  const normalizedBaseUrl = (baseUrl || '/api').replace(/\/$/, '');

  return async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    ApiRequestBoundary.assertBaseUrl(normalizedBaseUrl);
    ApiRequestBoundary.assertPath(path);

    return fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: ApiRequestBoundary.buildHeaders(token, init),
    });
  };
}
