import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../lib/api-client';
import BookingsPage from './page';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), locale: 'de' }));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../../lib/api-context', () => ({
  useApiContext: () => ({ apiRequest: mocks.apiRequest }),
}));

afterEach(() => {
  mocks.apiRequest.mockReset();
  mocks.locale = 'de';
});

describe('BookingsPage workspace contract', () => {
  it('keeps locale breadcrumbs and loads personal bookings on demand', async () => {
    mocks.locale = 'en';
    mocks.apiRequest.mockResolvedValue([]);
    render(<BookingsPage />);

    expect(screen.getByRole('link', { name: 'cueq' })).toHaveAttribute('href', '/en');
    fireEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith('/v1/bookings/me', expect.anything()),
    );
    expect(screen.getByText('noBookings')).toBeInTheDocument();
  });

  it('rejects incomplete correction requests before the API boundary', async () => {
    render(<BookingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'submitCorrection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('bookingIdRequired');
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it('surfaces the existing closing-lock request error without issuing a refresh', async () => {
    mocks.apiRequest.mockRejectedValue(
      new ApiRequestError(409, '409: Closing period locked.', {
        statusCode: 409,
        code: 'CLOSING_PERIOD_LOCKED',
        message: 'Closing period locked.',
        periodEnd: '2026-03-31T23:59:59.000Z',
      }),
    );
    render(<BookingsPage />);
    fireEvent.change(screen.getByRole('textbox', { name: /bookingIdLabel/u }), {
      target: { value: 'booking-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submitCorrection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('409: Closing period locked.');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
  });
});
