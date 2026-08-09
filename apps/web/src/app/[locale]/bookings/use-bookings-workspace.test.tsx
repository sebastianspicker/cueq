import { act, renderHook } from '@testing-library/react';
import type { useTranslations } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiContext } from '../../../lib/api-context';
import { useBookingsWorkspace } from './use-bookings-workspace';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../../lib/api-context', () => ({ useApiContext: vi.fn() }));

const t = ((key: string) => key) as ReturnType<typeof useTranslations>;

describe('useBookingsWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads personal bookings through the existing request contract', async () => {
    const apiRequest = vi.fn().mockResolvedValue([]);
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useBookingsWorkspace(t));

    await act(async () => {
      await result.current.loadBookings();
    });

    expect(apiRequest.mock.calls).toEqual([['/v1/bookings/me', expect.anything()]]);
    expect(result.current.bookings).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('preserves correction payload order and only reports success after its refresh', async () => {
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({ id: 'workflow-1' })
      .mockResolvedValueOnce([]);
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useBookingsWorkspace(t));

    act(() => {
      result.current.updateBookingId('booking-1');
      result.current.setStartTime('2026-03-03T08:00:00.000Z');
      result.current.setEndTime('2026-03-03T16:00:00.000Z');
      result.current.setTimeTypeId('time-type-1');
      result.current.updateReason('Timestamp mismatch');
    });
    await act(async () => {
      await result.current.requestCorrection();
    });

    expect(apiRequest.mock.calls).toEqual([
      [
        '/v1/workflows/booking-corrections',
        expect.anything(),
        {
          method: 'POST',
          body: JSON.stringify({
            bookingId: 'booking-1',
            startTime: '2026-03-03T08:00:00.000Z',
            endTime: '2026-03-03T16:00:00.000Z',
            timeTypeId: 'time-type-1',
            reason: 'Timestamp mismatch',
          }),
        },
      ],
      ['/v1/bookings/me', expect.anything()],
    ]);
    expect(result.current.message).toBe('correctionCreated');
    expect(result.current.error).toBeNull();
  });

  it('keeps a successful correction visible as refresh feedback when the reload fails', async () => {
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({ id: 'workflow-1' })
      .mockRejectedValueOnce(new Error('offline'));
    vi.mocked(useApiContext).mockReturnValue({ apiRequest } as never);
    const { result } = renderHook(() => useBookingsWorkspace(t));

    act(() => {
      result.current.updateBookingId('booking-1');
    });
    await act(async () => {
      await result.current.requestCorrection();
    });

    expect(result.current.message).toBeNull();
    expect(result.current.error).toBe('savedRefreshFailed');
    expect(result.current.loading).toBe(false);
  });
});
