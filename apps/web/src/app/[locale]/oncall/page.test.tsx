import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponseSchema } from '../../../lib/api-client';
import OnCallPage from './page';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  token: 'first-token',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../../lib/api-context', () => ({
  useApiContext: () => ({ token: mocks.token, apiRequest: mocks.apiRequest }),
}));

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve: resolve! };
}

function apiMock(
  handler: <T>(path: string, schema: ApiResponseSchema<T>, init?: RequestInit) => Promise<T>,
) {
  mocks.apiRequest.mockImplementation(handler);
}

function profile(role: 'EMPLOYEE' | 'SHIFT_PLANNER' | 'ADMIN') {
  return {
    id: 'c00000000000000000000001',
    email: 'planner@example.test',
    role,
    organizationUnitId: 'c00000000000000000000002',
    firstName: 'On',
    lastName: 'Call',
  };
}

afterEach(() => {
  mocks.apiRequest.mockReset();
  mocks.token = 'first-token';
});

describe('OnCallPage workspace contract', () => {
  it('resets auth for a new token and ignores the cancelled stale /v1/me response', async () => {
    const secondMe = deferred<ReturnType<typeof profile>>();
    const thirdMe = deferred<ReturnType<typeof profile>>();
    const responses = [Promise.resolve(profile('ADMIN')), secondMe.promise, thirdMe.promise];
    let meRequest = 0;
    apiMock((path, schema) => {
      if (path === '/v1/me') {
        const response = responses[meRequest];
        meRequest += 1;
        if (!response) {
          throw new Error('Unexpected /v1/me request');
        }
        return response.then((value) => schema.parse(value));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    const view = render(<OnCallPage />);
    await screen.findByRole('button', { name: 'createRotation' });

    mocks.token = 'second-token';
    view.rerender(<OnCallPage />);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'createRotation' })).not.toBeInTheDocument();

    mocks.token = 'third-token';
    view.rerender(<OnCallPage />);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(3));
    thirdMe.resolve(profile('ADMIN'));
    await screen.findByRole('button', { name: 'createRotation' });

    secondMe.resolve(profile('EMPLOYEE'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'createRotation' })).toBeInTheDocument(),
    );
  });

  it('shows the request failure from a failed load and keeps command controls usable afterwards', async () => {
    apiMock((path, schema) => {
      if (path === '/v1/me') {
        return Promise.resolve(schema.parse(profile('SHIFT_PLANNER')));
      }
      if (path === '/v1/oncall/rotations') {
        return Promise.reject(new Error('Rotation service unavailable'));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<OnCallPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadRotations' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Rotation service unavailable');
    expect(screen.getByRole('button', { name: 'loadRotations' })).toBeEnabled();
  });

  it('short-circuits rotation validation without issuing a mutation', async () => {
    apiMock((path, schema) => {
      if (path === '/v1/me') {
        return Promise.resolve(schema.parse(profile('SHIFT_PLANNER')));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<OnCallPage />);
    await screen.findByRole('button', { name: 'createRotation' });
    fireEvent.click(screen.getByRole('button', { name: 'createRotation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('rotationMissingFields');
    expect(mocks.apiRequest.mock.calls).toEqual([['/v1/me', expect.anything()]]);
  });

  it('refreshes rotations after a successful mutation and reports success only after the refresh', async () => {
    const refresh = deferred<unknown[]>();
    apiMock((path, schema, init) => {
      if (path === '/v1/me') {
        return Promise.resolve(schema.parse(profile('SHIFT_PLANNER')));
      }
      if (path === '/v1/oncall/rotations' && init?.method === 'POST') {
        return Promise.resolve(
          schema.parse({
            id: 'c00000000000000000000003',
            personId: 'c00000000000000000000004',
            organizationUnitId: 'c00000000000000000000005',
            startTime: '2026-03-03T08:00:00.000Z',
            endTime: '2026-03-10T08:00:00.000Z',
            rotationType: 'WEEKLY',
            note: null,
          }),
        );
      }
      if (path === '/v1/oncall/rotations') {
        return refresh.promise.then((value) => schema.parse(value));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<OnCallPage />);
    await screen.findByRole('button', { name: 'createRotation' });
    fireEvent.change(screen.getByLabelText('personIdLabel'), {
      target: { value: 'c00000000000000000000004' },
    });
    fireEvent.change(screen.getByLabelText('organizationUnitIdLabel'), {
      target: { value: 'c00000000000000000000005' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'createRotation' }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        '/v1/oncall/rotations',
        expect.anything(),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'loading' })).not.toHaveLength(0);
    expect(
      screen
        .getAllByRole('button', { name: 'loading' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);

    refresh.resolve([]);
    expect(await screen.findByRole('status')).toHaveTextContent('rotationCreated');
  });

  it('defaults compliance to the current user when no person is entered', async () => {
    apiMock((path, schema) => {
      if (path === '/v1/me') {
        return Promise.resolve(schema.parse(profile('EMPLOYEE')));
      }
      if (path.startsWith('/v1/oncall/compliance?')) {
        return Promise.resolve(
          schema.parse({
            personId: 'c00000000000000000000001',
            rotationId: null,
            restHoursAfterDeployment: 11,
            minimumRestHours: 11,
            compliant: true,
            violations: [],
          }),
        );
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<OnCallPage />);
    fireEvent.click(screen.getByRole('button', { name: 'runCompliance' }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        '/v1/oncall/compliance?personId=c00000000000000000000001&nextShiftStart=2026-03-10T09%3A00%3A00.000Z',
        expect.anything(),
      ),
    );
  });
});
