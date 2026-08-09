/** Shared transport contracts used by API request and fetch factories. */

/** Minimal parser contract accepted from shared runtime schemas. */
export interface ApiResponseSchema<T> {
  parse(input: unknown): T;
}

/** Validated API request that parses a successful response through its runtime schema. */
export type ApiRequest = <T>(
  path: string,
  schema: ApiResponseSchema<T>,
  init?: RequestInit,
) => Promise<T>;

/** Raw API fetch boundary for callers that need headers, streams, or non-JSON responses. */
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
