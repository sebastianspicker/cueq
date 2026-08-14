import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiContext } from '../../../lib/api-context';
import { getStoredPreference } from '../../../lib/preferences';
import { useAuditWorkspace } from './use-audit-workspace';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../../lib/api-context', () => ({ useApiContext: vi.fn() }));
vi.mock('../../../lib/preferences', () => ({
  PAGE_SIZE_PREFERENCE_SLOT: 'cq-page-size',
  getStoredPreference: vi.fn(),
}));

const auditSummary = {
  from: '2026-03-01',
  to: '2026-03-31',
  totals: { entries: 1, uniqueActors: 1, reportAccesses: 1, exportsTriggered: 0, lockBlocks: 0 },
  byAction: [],
  byEntityType: [],
};

const entry = (id: string) => ({
  id,
  timestamp: '2026-03-02T08:00:00.000Z',
  actorId: 'c000000000000000000000001',
  action: 'BOOKING_CREATED',
  entityType: 'Booking',
  entityId: 'c000000000000000000000002',
  reason: null,
});

describe('useAuditWorkspace', () => {
  beforeEach(() => {
    vi.mocked(getStoredPreference).mockReturnValue('25');
  });

  it('uses the exact summary and filtered entry query order while replacing then appending pages', async () => {
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce(auditSummary)
      .mockResolvedValueOnce({ items: [entry('first')], total: 2 })
      .mockResolvedValueOnce({ items: [entry('second')], total: 2 })
      .mockResolvedValueOnce({ items: [entry('replacement')], total: 1 });
    vi.mocked(useApiContext).mockReturnValue({
      apiBaseUrl: '/api',
      token: '',
      apiRequest,
    } as never);

    const { result } = renderHook(() => useAuditWorkspace());

    await act(async () => {
      await result.current.loadSummary();
    });
    expect(apiRequest.mock.calls[0]?.[0]).toBe(
      '/v1/reports/audit-summary?from=2026-03-01&to=2026-03-31',
    );

    act(() => {
      result.current.setFilterAction('BOOKING_CREATED');
      result.current.setFilterEntityType('Booking');
      result.current.setFilterActorId('c000000000000000000000001');
      result.current.setFilterEntityId('c000000000000000000000002');
    });
    await act(async () => {
      await result.current.loadEntries();
    });
    expect(apiRequest.mock.calls[1]?.[0]).toBe(
      '/v1/audit-entries?from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-31T23%3A59%3A59.999Z&action=BOOKING_CREATED&entityType=Booking&actorId=c000000000000000000000001&entityId=c000000000000000000000002&skip=0&take=25',
    );
    expect(result.current.entries.map((item) => item.id)).toEqual(['first']);

    await act(async () => {
      await result.current.loadEntries(result.current.entriesSkip);
    });
    expect(result.current.entries.map((item) => item.id)).toEqual(['first', 'second']);

    await act(async () => {
      await result.current.loadEntriesFromStart();
    });
    expect(result.current.entries.map((item) => item.id)).toEqual(['replacement']);
    expect(result.current.entriesSkip).toBe(1);
  });

  it('uses the stored page-size preference and resets report data when API identity changes', async () => {
    let apiBaseUrl = '/api';
    const apiRequest = vi.fn().mockResolvedValue(auditSummary);
    vi.mocked(useApiContext).mockImplementation(
      () =>
        ({
          apiBaseUrl,
          token: '',
          apiRequest,
        }) as never,
    );
    const { result, rerender } = renderHook(() => useAuditWorkspace());

    expect(result.current.pageSize).toBe(25);
    await act(async () => {
      await result.current.loadSummary();
    });
    expect(result.current.summary).toEqual(auditSummary);

    apiBaseUrl = 'https://api.example.test';
    rerender();

    expect(result.current.summary).toBeNull();
    expect(result.current.entries).toEqual([]);
    expect(result.current.entriesTotal).toBeNull();
    expect(result.current.entriesSkip).toBe(0);
  });
});
