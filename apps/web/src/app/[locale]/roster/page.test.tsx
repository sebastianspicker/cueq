import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RosterPage from './page';

const mocks = vi.hoisted(() => ({
  locale: 'de',
  workspace: { marker: 'roster-workspace' },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `roster.${key}` }));
vi.mock('./use-roster-workspace', () => ({ useRosterWorkspace: () => mocks.workspace }));
vi.mock('./roster-workspace', () => ({
  RosterWorkspace: ({ workspace }: { workspace: object }) => (
    <div
      data-testid="roster-workspace"
      data-workspace={workspace === mocks.workspace ? 'connected' : 'disconnected'}
    />
  ),
}));

afterEach(() => {
  mocks.locale = 'de';
});

describe('RosterPage route composition', () => {
  it('keeps locale-aware route chrome around the extracted workspace', () => {
    mocks.locale = 'en';

    render(<RosterPage />);

    expect(screen.getByRole('link', { name: 'cueq' })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('heading', { name: 'roster.title' })).toBeInTheDocument();
    expect(screen.getByTestId('roster-workspace')).toHaveAttribute('data-workspace', 'connected');
  });
});
