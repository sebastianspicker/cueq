import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../src/messages/en.json';
import { CommandPalette } from '../../src/components/workspace/CommandPalette';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('command palette semantics', () => {
  it('renders a named modal with ordinary action buttons and a labelled search field', () => {
    const html = renderToStaticMarkup(
      createElement(CommandPalette, {
        locale: 'en',
        messages: messages.app,
        items: [{ key: 'dashboard', path: 'dashboard', icon: 'dashboard' }],
        open: true,
        onClose: vi.fn(),
        onToggleTheme: vi.fn(),
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(`aria-label="${messages.app.commandSearch}"`);
    expect(html).not.toMatch(/role="(?:listbox|option)"/);
    expect(html.match(/<button /g)).toHaveLength(3);
    expect(html).toContain(messages.app.commandTheme);
  });

  it('removes the dialog and its controls when closed', () => {
    expect(
      renderToStaticMarkup(
        createElement(CommandPalette, {
          locale: 'en',
          messages: messages.app,
          items: [],
          open: false,
          onClose: vi.fn(),
          onToggleTheme: vi.fn(),
        }),
      ),
    ).toBe('');
  });
});
