/** Schema-validating API request factory. */

import { ApiContractError, ApiRequestError } from './api-client-errors';
import type { ApiRequest, ApiResponseSchema } from './api-client-types';
import { createApiFetch } from './api-fetch';
import {
  normalizeApiContractIssues,
  readApiResponsePayload,
  safeApiErrorPayload,
} from './api-response';

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
    const payload = await readApiResponsePayload(
      response,
      (message) => new ApiContractError(message),
    );

    if (!response.ok) {
      const safePayload = safeApiErrorPayload(payload);
      const userMessage = safePayload?.message ?? defaultMessage;
      throw new ApiRequestError(response.status, `${response.status}: ${userMessage}`, safePayload);
    }

    try {
      return schema.parse(payload);
    } catch (error) {
      throw new ApiContractError(
        'The API returned a response that does not match its contract.',
        normalizeApiContractIssues(error),
      );
    }
  };
}
