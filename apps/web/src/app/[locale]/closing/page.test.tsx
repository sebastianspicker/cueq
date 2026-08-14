import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClosingPage from './page';

const mocks = vi.hoisted(() => ({
  locale: 'de',
  apiFetch: vi.fn(),
  apiRequest: vi.fn(),
  profile: { role: 'TEAM_LEAD', organizationUnitId: 'ou-1' },
  setOrganizationUnitId: vi.fn(),
  loadPeriods: vi.fn(),
  periods: { loading: false, period: { id: 'period-1' } },
  actions: { loading: true },
  download: { loading: false },
  organizationScope: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `closing.${key}` }));
vi.mock('../../../lib/api-context', () => ({
  useApiContext: () => ({ apiFetch: mocks.apiFetch, apiRequest: mocks.apiRequest }),
}));
vi.mock('../../../components/AppWorkspace', () => ({
  useSessionContext: () => ({ profile: mocks.profile }),
}));
vi.mock('./use-closing-periods', () => ({
  useClosingPeriods: (_t: unknown, apiRequest: unknown) => ({
    ...mocks.periods,
    setOrganizationUnitId: mocks.setOrganizationUnitId,
    loadPeriods: mocks.loadPeriods,
    apiRequest,
  }),
}));
vi.mock('./use-closing-actions', () => ({
  useClosingActions: (_t: unknown, apiRequest: unknown, period: unknown, loadPeriods: unknown) => ({
    ...mocks.actions,
    apiRequest,
    period,
    loadPeriods,
  }),
}));
vi.mock('./use-closing-artifact-download', () => ({
  useArtifactDownload: (_t: unknown, apiFetch: unknown, period: unknown) => ({
    ...mocks.download,
    apiFetch,
    period,
  }),
}));
vi.mock('./use-closing-organization-scope', () => ({
  useOrganizationUnitScope: (...args: unknown[]) => mocks.organizationScope(...args),
}));
vi.mock('./closing-workspace', () => ({
  ClosingWorkspace: ({
    locale,
    role,
    periods,
    actions,
    download,
    loading,
  }: {
    locale: string;
    role: string;
    periods: { apiRequest: unknown };
    actions: { loadPeriods: unknown };
    download: { apiFetch: unknown };
    loading: boolean;
  }) => (
    <div
      data-testid="closing-workspace"
      data-locale={locale}
      data-role={role}
      data-loading={String(loading)}
      data-periods={periods.apiRequest === mocks.apiRequest ? 'connected' : 'disconnected'}
      data-actions={actions.loadPeriods === mocks.loadPeriods ? 'connected' : 'disconnected'}
      data-download={download.apiFetch === mocks.apiFetch ? 'connected' : 'disconnected'}
    />
  ),
}));

afterEach(() => {
  mocks.locale = 'de';
  mocks.organizationScope.mockReset();
});

describe('ClosingPage route composition', () => {
  it('connects API, session, locale, and extracted closing hooks', () => {
    mocks.locale = 'en';

    render(<ClosingPage />);

    expect(mocks.organizationScope).toHaveBeenCalledWith(
      'TEAM_LEAD',
      'ou-1',
      mocks.setOrganizationUnitId,
    );
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-locale', 'en');
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-role', 'TEAM_LEAD');
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-periods', 'connected');
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-actions', 'connected');
    expect(screen.getByTestId('closing-workspace')).toHaveAttribute('data-download', 'connected');
  });
});
