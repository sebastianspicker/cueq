import { describe, expect, it, vi } from 'vitest';
import { ZodExceptionFilter } from './zod-exception.filter';

function buildMockHost(statusFn: ReturnType<typeof vi.fn>, jsonFn: ReturnType<typeof vi.fn>) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: statusFn.mockReturnValue({ json: jsonFn }),
      }),
      getRequest: () => ({}),
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => 'http' as const,
  };
}

describe('ZodExceptionFilter', () => {
  const mockAdapterHost = {
    httpAdapter: {
      reply: vi.fn(),
      status: vi.fn(),
      getRequestHostname: vi.fn(),
      getRequestMethod: vi.fn(),
      getRequestUrl: vi.fn(),
      isHeadersSent: vi.fn(),
    },
  };
  const filter = new ZodExceptionFilter(mockAdapterHost as never);

  it('returns message as string and details as array for Zod-like errors', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    const zodLikeError = {
      issues: [
        { message: 'Required', path: ['name'] },
        { message: 'Invalid email', path: ['email'] },
      ],
    };

    filter.catch(zodLikeError, host as never);

    expect(statusFn).toHaveBeenCalledWith(400);
    const body = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(typeof body.message).toBe('string');
    expect(body.message).toBe('Required; Invalid email');
    expect(body.details).toEqual(['Required', 'Invalid email']);
  });

  it('does not include raw Zod issues in response', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    const zodLikeError = {
      issues: [{ message: 'Required', path: ['field'] }],
    };

    filter.catch(zodLikeError, host as never);

    const body = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('issues');
  });

  it('handles issues with non-string messages gracefully', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    const zodLikeError = {
      issues: [{ message: 42, path: [] }, { path: [] }],
    };

    filter.catch(zodLikeError, host as never);

    const body = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.details).toEqual(['Invalid request payload.', 'Invalid request payload.']);
  });
});
