import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponseSchema } from '../../../lib/api-client';
import PolicyAdminPage from './page';

const mocks = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  apiRequest: vi.fn(),
  token: 'first-token',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../../lib/api-context', () => ({
  useApiContext: () => ({
    apiBaseUrl: mocks.apiBaseUrl,
    token: mocks.token,
    apiRequest: mocks.apiRequest,
  }),
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

const workflowPolicy = {
  id: 'c00000000000000000000001',
  type: 'LEAVE_REQUEST',
  escalationDeadlineHours: 48,
  escalationRoles: ['HR', 'ADMIN'],
  maxDelegationDepth: 5,
  activeFrom: '2026-03-01T00:00:00.000Z',
  activeTo: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const policyBundle = {
  asOf: '2026-03-15',
  policies: [
    {
      id: 'c00000000000000000000002',
      type: 'LEAVE_RULE',
      name: 'Leave policy',
      description: 'Leave policy description',
      version: 1,
      effectiveFrom: '2026-03-01',
      effectiveTo: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      createdBy: 'c00000000000000000000003',
      payload: {},
    },
  ],
};

afterEach(() => {
  mocks.apiBaseUrl = '/api';
  mocks.apiRequest.mockReset();
  mocks.token = 'first-token';
});

describe('PolicyAdminPage workspace contract', () => {
  it('clears bundle, history, and success feedback when the API base changes without resetting form defaults', async () => {
    apiMock((path, schema) => {
      if (path === '/v1/policies?asOf=2026-03-15') {
        return Promise.resolve(schema.parse(policyBundle));
      }
      if (path === '/v1/workflows/policies/LEAVE_REQUEST/history') {
        return Promise.resolve(schema.parse({ entries: [workflowPolicy], total: 1 }));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    const view = render(<PolicyAdminPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadBundle' }));
    expect(await screen.findByText('Leave policy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'loadHistory' }));
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('historyLoaded');

    mocks.apiBaseUrl = '/new-api';
    view.rerender(<PolicyAdminPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText('Leave policy')).not.toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.getByLabelText('asOfLabel')).toHaveValue('2026-03-15');
    expect(screen.getByLabelText('escalationDeadlineHoursLabel')).toHaveValue(48);
    expect(screen.getByLabelText('escalationRolesLabel')).toHaveValue('HR,ADMIN');
    expect(screen.getByLabelText('maxDelegationDepthLabel')).toHaveValue(5);
    expect(screen.getByLabelText('dailyMaxMinutesLabel')).toHaveValue(600);
    expect(screen.getByLabelText('minRestMinutesLabel')).toHaveValue(660);
  });

  it('clears failed feedback when the session token changes without resetting form defaults', async () => {
    apiMock(() => Promise.reject(new Error('Policy service unavailable')));

    const view = render(<PolicyAdminPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadTimeThresholds' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Policy service unavailable');

    mocks.token = 'second-token';
    view.rerender(<PolicyAdminPage />);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('asOfLabel')).toHaveValue('2026-03-15');
    expect(screen.getByLabelText('escalationRolesLabel')).toHaveValue('HR,ADMIN');
    expect(screen.getByLabelText('dailyMaxMinutesLabel')).toHaveValue(600);
  });

  it('preserves workflow form values and reports the missing state for a nullable workflow policy', async () => {
    apiMock((path, schema) => {
      if (path === '/v1/workflows/policies/LEAVE_REQUEST') {
        return Promise.resolve(schema.parse(null));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<PolicyAdminPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadWorkflowPolicy' }));

    expect(await screen.findByRole('status')).toHaveTextContent('workflowPolicyMissing');
    expect(screen.getByLabelText('escalationDeadlineHoursLabel')).toHaveValue(48);
    expect(screen.getByLabelText('escalationRolesLabel')).toHaveValue('HR,ADMIN');
    expect(screen.getByLabelText('maxDelegationDepthLabel')).toHaveValue(5);
  });

  it('trims and filters comma-separated workflow roles in the unchanged PUT body', async () => {
    apiMock((path, schema, init) => {
      if (path === '/v1/workflows/policies/LEAVE_REQUEST' && init?.method === 'PUT') {
        return Promise.resolve(schema.parse(workflowPolicy));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<PolicyAdminPage />);
    fireEvent.change(screen.getByLabelText('escalationRolesLabel'), {
      target: { value: ' HR, ,ADMIN , ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'saveWorkflowPolicy' }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith(
        '/v1/workflows/policies/LEAVE_REQUEST',
        expect.anything(),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            escalationDeadlineHours: 48,
            escalationRoles: ['HR', 'ADMIN'],
            maxDelegationDepth: 5,
          }),
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('workflowPolicySaved');
  });

  it('shows failed request feedback and re-enables actions afterwards', async () => {
    apiMock(() => Promise.reject(new Error('Threshold service unavailable')));

    render(<PolicyAdminPage />);
    fireEvent.click(screen.getByRole('button', { name: 'saveTimeThresholds' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Threshold service unavailable');
    expect(screen.getByRole('button', { name: 'saveTimeThresholds' })).toBeEnabled();
  });

  it('disables every action while a request is loading', async () => {
    const bundle = deferred<typeof policyBundle>();
    apiMock((path, schema) => {
      if (path === '/v1/policies?asOf=2026-03-15') {
        return bundle.promise.then((value) => schema.parse(value));
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<PolicyAdminPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadBundle' }));

    expect(screen.getAllByRole('button', { name: 'loading' })).toHaveLength(6);
    expect(
      screen
        .getAllByRole('button', { name: 'loading' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);

    bundle.resolve(policyBundle);
    expect(await screen.findByRole('status')).toHaveTextContent('bundleLoaded');
    expect(screen.getByRole('button', { name: 'loadBundle' })).toBeEnabled();
  });
});
