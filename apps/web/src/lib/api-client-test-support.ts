import { afterEach, vi } from 'vitest';

export const UnknownResponseSchema = {
  parse(input: unknown): unknown {
    return input;
  },
};

export function registerApiClientTestCleanup(): void {
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
