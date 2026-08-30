import type { SafeApiErrorPayload } from '@cueq/contracts';
import type { ApiContractIssue } from './api-response';

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

export class ApiContractError extends Error {
  readonly issues: readonly ApiContractIssue[];

  constructor(message: string, issues: readonly ApiContractIssue[] = []) {
    super(message);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}
