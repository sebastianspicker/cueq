import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@cueq/database';
import { PrismaExceptionFilter } from './prisma-exception.filter';

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

function makePrismaError(code: string, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '5.0.0',
  });
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  it('returns 409 for P2002 unique constraint violation', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    filter.catch(makePrismaError('P2002', 'Unique constraint failed'), host as never);

    expect(statusFn).toHaveBeenCalledWith(409);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
      }),
    );
  });

  it('returns 404 for P2025 record not found', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    filter.catch(makePrismaError('P2025', 'Record to update not found'), host as never);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
      }),
    );
  });

  it('returns 400 for P2003 foreign key constraint violation', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    filter.catch(makePrismaError('P2003', 'Foreign key constraint'), host as never);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
      }),
    );
  });

  it('returns 500 for unknown Prisma error codes', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    filter.catch(makePrismaError('P2010', 'Raw query failed'), host as never);

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
      }),
    );
  });

  it('does not leak Prisma error details in response body', () => {
    const statusFn = vi.fn();
    const jsonFn = vi.fn();
    const host = buildMockHost(statusFn, jsonFn);

    filter.catch(
      makePrismaError('P2002', 'Unique constraint failed on the fields: (`email`)'),
      host as never,
    );

    const body = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.message).not.toContain('email');
    expect(body.message).not.toContain('Prisma');
  });

  it('does not expose stack property in any error response', () => {
    const codes = ['P2002', 'P2003', 'P2025', 'P2010'];
    for (const code of codes) {
      const statusFn = vi.fn();
      const jsonFn = vi.fn();
      const host = buildMockHost(statusFn, jsonFn);

      filter.catch(makePrismaError(code, `Error for ${code}`), host as never);

      const body = jsonFn.mock.calls[0]![0] as Record<string, unknown>;
      expect(body).not.toHaveProperty('stack');
    }
  });
});
