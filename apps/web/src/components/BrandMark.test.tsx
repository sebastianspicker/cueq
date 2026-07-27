import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrandMark } from './BrandMark';
import { WorkspaceIcon } from './WorkspaceIcon';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('cueq brand primitives', () => {
  it('renders the canonical lowercase name and factual descriptor as one home link', () => {
    render(
      <BrandMark
        href="/de/dashboard"
        descriptor="Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen"
      />,
    );

    expect(
      screen.getByRole('link', {
        name: 'cueq: Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen',
      }),
    ).toHaveAttribute('href', '/de/dashboard');
    expect(screen.getByText('cueq')).toBeVisible();
    expect(
      screen.getByText('Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen'),
    ).toBeVisible();
  });

  it('keeps decorative brand and workspace vectors out of the accessibility tree', () => {
    const { container } = render(
      <>
        <BrandMark href="/en/dashboard" variant="compact" />
        <WorkspaceIcon name="dashboard" />
      </>,
    );

    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'cueq' })).toHaveAttribute('href', '/en/dashboard');
  });
});
