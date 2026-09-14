'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceIcon } from '../WorkspaceIcon';
import { ChromeGlyph } from './ChromeGlyph';
import { navItemHref, navItemLabel } from './nav-items';
import type { NavItem, WorkspaceMessages } from './types';

interface CommandPaletteProps {
  locale: string;
  messages: WorkspaceMessages;
  items: readonly NavItem[];
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
}

export function CommandPalette({
  locale,
  messages,
  items,
  open,
  onClose,
  onToggleTheme,
}: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const actions = useMemo(
    () => [
      ...items.map((item) => ({ id: item.path, label: navItemLabel(item, messages), item })),
      { id: 'theme', label: messages.commandTheme, item: null },
    ],
    [items, messages],
  );
  const results = actions.filter((action) =>
    action.label.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)),
  );

  const activate = useCallback(
    (id: string, item: NavItem | null) => {
      if (id === 'theme') onToggleTheme();
      else if (item) router.push(navItemHref(locale, item));
      onClose();
    },
    [locale, onClose, onToggleTheme, router],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="cq-command-scrim" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="cq-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={messages.commandSearch}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cq-command-input-wrap">
          <ChromeGlyph name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const first = results[0];
              if (!first) return;
              event.preventDefault();
              activate(first.id, first.item);
            }}
            placeholder={messages.commandPlaceholder}
            aria-label={messages.commandSearch}
          />
          <button
            type="button"
            className="cq-command-close"
            onClick={onClose}
            aria-label={messages.commandClose}
          >
            <ChromeGlyph name="close" />
          </button>
        </div>
        <div className="cq-command-results">
          {results.map(({ id, label, item }) => (
            <button
              type="button"
              key={id}
              className="cq-command-item"
              onClick={() => activate(id, item)}
            >
              {item ? <WorkspaceIcon name={item.icon} /> : <ChromeGlyph name="moon" />}
              <span>{label}</span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="cq-command-empty">{messages.commandNoResults}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
