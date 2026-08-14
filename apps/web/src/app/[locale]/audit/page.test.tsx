import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AuditPage from './page';

const mocks = vi.hoisted(() => ({ workspace: { marker: 'audit-workspace' } }));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `audit.${key}` }));
vi.mock('./use-audit-workspace', () => ({ useAuditWorkspace: () => mocks.workspace }));
vi.mock('./audit-workspace', () => ({
  AuditWorkspace: ({ t, workspace }: { t: (key: string) => string; workspace: object }) => (
    <div
      data-testid="audit-workspace"
      data-title={t('title')}
      data-workspace={workspace === mocks.workspace ? 'connected' : 'disconnected'}
    />
  ),
}));

describe('AuditPage route composition', () => {
  it('passes translations and hook-owned state to the extracted workspace', () => {
    render(<AuditPage />);

    expect(screen.getByTestId('audit-workspace')).toHaveAttribute('data-title', 'audit.title');
    expect(screen.getByTestId('audit-workspace')).toHaveAttribute('data-workspace', 'connected');
  });
});
