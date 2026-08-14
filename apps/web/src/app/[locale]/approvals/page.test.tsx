import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ApprovalsPage from './page';

const mocks = vi.hoisted(() => ({
  locale: 'de',
  workspace: { marker: 'approvals-workspace' },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `approvals.${key}` }));
vi.mock('./use-approvals-workspace', () => ({
  useApprovalsWorkspace: () => mocks.workspace,
}));
vi.mock('./approvals-workspace', () => ({
  ApprovalsWorkspace: ({
    locale,
    t,
    workspace,
  }: {
    locale: string;
    t: (key: string) => string;
    workspace: object;
  }) => (
    <div
      data-testid="approvals-workspace"
      data-locale={locale}
      data-title={t('title')}
      data-workspace={workspace === mocks.workspace ? 'connected' : 'disconnected'}
    />
  ),
}));

afterEach(() => {
  mocks.locale = 'de';
});

describe('ApprovalsPage route composition', () => {
  it('connects the localized route to the extracted workspace hook', () => {
    mocks.locale = 'en';

    render(<ApprovalsPage />);

    expect(screen.getByTestId('approvals-workspace')).toHaveAttribute('data-locale', 'en');
    expect(screen.getByTestId('approvals-workspace')).toHaveAttribute(
      'data-title',
      'approvals.title',
    );
    expect(screen.getByTestId('approvals-workspace')).toHaveAttribute(
      'data-workspace',
      'connected',
    );
  });
});
