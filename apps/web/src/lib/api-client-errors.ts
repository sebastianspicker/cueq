/** Error values emitted by the browser API transport. */

import type { SafeApiErrorPayload } from '@cueq/shared';
import type { ApiContractIssue } from './api-response';

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
