import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponseSchema } from '../../../lib/api-client';
import { ApiRequestError } from '../../../lib/api-client';
import DashboardPage from './page';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

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
  useApiContext: () => ({ apiRequest: mocks.apiRequest }),
}));

afterEach(() => {
  mocks.apiRequest.mockReset();
});

describe('DashboardPage clock-in integrity', () => {
  it('does not move a rejected clock-in past a locked closing period', async () => {
    mocks.apiRequest.mockImplementation(
      <T,>(path: string, schema: ApiResponseSchema<T>, init?: RequestInit): Promise<T> => {
        if (path === '/v1/dashboard/me') {
          return Promise.resolve(
            schema.parse({
              personId: 'c000000000000000000000100',
              modelName: 'Test model',
              todayTargetHours: 7.8,
              currentBalanceHours: 0,
              todayBookingsCount: 0,
              hasFirstBooking: false,
              showOrientation: true,
              clockInTimeTypeId: 'c000000000000000000000200',
              period: null,
              quickActions: ['CLOCK_IN'],
              now: '2026-03-18T09:30:00.000Z',
            }),
          );
        }
        if (path === '/v1/bookings/me') {
          return Promise.resolve(schema.parse([]));
        }
        if (path === '/v1/bookings' && init?.method === 'POST') {
          return Promise.reject(
            new ApiRequestError(409, '409: Closing period locked.', {
              statusCode: 409,
              code: 'CLOSING_PERIOD_LOCKED',
              message: 'Closing period locked.',
              periodEnd: '2026-03-31T23:59:59.000Z',
            }),
          );
        }
        throw new Error(`Unexpected API request: ${path}`);
      },
    );

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'loadSummary' }));
    expect(await screen.findAllByText(/Test model/u)).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'clockIn' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('clockInLocked'));
    const bookingCalls = mocks.apiRequest.mock.calls.filter(([path]) => path === '/v1/bookings');
    expect(bookingCalls).toHaveLength(1);
  });
});
