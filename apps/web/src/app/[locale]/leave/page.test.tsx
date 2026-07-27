import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponseSchema } from '../../../lib/api-client';
import LeavePage from './page';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const PERSON_ID = 'c00000000000000000000001';
const ABSENCE_ID = 'c00000000000000000000002';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'de' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../../lib/api-context', () => ({
  useApiContext: () => ({
    apiBaseUrl: 'http://localhost:3001',
    setApiBaseUrl: vi.fn(),
    token: 'test-token',
    setToken: vi.fn(),
    apiRequest: mocks.apiRequest,
  }),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function leaveRefreshRequest<T>(
  absences: Deferred<unknown[]>,
  balance: Deferred<Record<string, unknown>>,
  path: string,
  schema: ApiResponseSchema<T>,
  init?: RequestInit,
): Promise<T> {
  if (path === '/v1/me') return Promise.resolve(schema.parse({ id: PERSON_ID }));
  if (path === '/v1/absences' && init?.method === 'POST') {
    return Promise.resolve(
      schema.parse({
        id: ABSENCE_ID,
        personId: PERSON_ID,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-22',
        days: 3,
        status: 'REQUESTED',
        note: null,
        createdAt: '2026-04-01T08:00:00.000Z',
        updatedAt: '2026-04-01T08:00:00.000Z',
      }),
    );
  }
  if (path === '/v1/absences/me') {
    return absences.promise.then((value) => schema.parse(value));
  }
  if (path.startsWith('/v1/leave-balance/me?')) {
    return balance.promise.then((value) => schema.parse(value));
  }
  throw new Error(`Unexpected API request: ${path}`);
}

afterEach(() => {
  mocks.apiRequest.mockReset();
});

describe('LeavePage mutation refresh', () => {
  it('keeps controls busy until every concurrent refresh completes', async () => {
    const absences = deferred<unknown[]>();
    const balance = deferred<Record<string, unknown>>();
    mocks.apiRequest.mockImplementation(
      <T,>(path: string, schema: ApiResponseSchema<T>, init?: RequestInit) =>
        leaveRefreshRequest(absences, balance, path, schema, init),
    );

    render(<LeavePage />);
    const submit = screen.getByRole('button', { name: 'submitRequest' });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        '/v1/absences/me',
        expect.objectContaining({ parse: expect.any(Function) }),
      ),
    );
    expect(submit).toBeDisabled();

    await act(async () => {
      absences.resolve([]);
      await absences.promise;
    });
    expect(submit).toBeDisabled();

    await act(async () => {
      balance.resolve({
        personId: PERSON_ID,
        year: 2026,
        asOfDate: '2026-12-31',
        entitlement: 30,
        used: 0,
        remaining: 30,
        carriedOver: 0,
        carriedOverUsed: 0,
        forfeited: 0,
        adjustments: 0,
      });
      await balance.promise;
    });
    await waitFor(() => expect(submit).toBeEnabled());
  });
});
