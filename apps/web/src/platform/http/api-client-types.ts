export interface ApiResponseSchema<T> {
  parse(input: unknown): T;
}

export type ApiRequest = <T>(
  path: string,
  schema: ApiResponseSchema<T>,
  init?: RequestInit,
) => Promise<T>;

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
