import { SafeApiErrorPayloadSchema, type SafeApiErrorPayload } from '@cueq/contracts';

export interface ApiContractIssue {
  code: string;
  path: string;
}

function parseApiResponsePayload(
  text: string,
  isSuccessful: boolean,
  createContractError: (message: string) => Error,
): unknown {
  try {
    return JSON.parse(text);
  } catch {
    if (isSuccessful) {
      throw createContractError('The API returned malformed JSON.');
    }
    return null;
  }
}

export async function readApiResponsePayload(
  response: Pick<Response, 'ok' | 'text'>,
  createContractError: (message: string) => Error,
): Promise<unknown> {
  const text = await response.text();
  return text ? parseApiResponsePayload(text, response.ok, createContractError) : null;
}

export function safeApiErrorPayload(payload: unknown): SafeApiErrorPayload | null {
  const result = SafeApiErrorPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function normalizeApiContractIssues(error: unknown): ApiContractIssue[] {
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
