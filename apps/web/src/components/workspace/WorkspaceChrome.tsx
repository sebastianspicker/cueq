'use client';

import Link from 'next/link';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { AssignmentSelector } from './AssignmentSelector';
import type { AssignmentContextState } from './use-assignment-context';
import { BrandMark } from '../BrandMark';
import { LocaleSwitchLink } from '../LocaleSwitchLink';
import { WorkspaceIcon } from '../WorkspaceIcon';
import {
  getStoredPreference,
  THEME_PREFERENCE_SLOT,
  toggleThemePreference,
  type ThemePreference,
} from '../../platform/browser/preferences';
import { ChromeGlyph } from './ChromeGlyph';
import { CommandPalette } from './CommandPalette';
import {
  activeSectionLabel,
  getVisibleNavGroups,
  isNavItemActive,
  navItemHref,
  navItemLabel,
  SETTINGS_ITEM,
} from './nav-items';
import type { MeProfile, NavItem, SessionPhase, WorkspaceMessages } from './types';
import { sessionLabelFor } from './use-current-session';

interface WorkspaceChromeProps {
  assignment: AssignmentContextState;
  children: ReactNode;
  locale: string;
  altLocale: string;
  pathname: string;
  messages: WorkspaceMessages;
  phase: SessionPhase;
  profile: MeProfile | null;
  lastSuccessfulAt: number | null;
  refresh: () => void;
}

function TaskNavLink({
  item,
  locale,
  pathname,
  messages,
  onNavigate,
}: {
  item: NavItem;
  locale: string;
  pathname: string;
  messages: WorkspaceMessages;
  onNavigate?: () => void;
}) {
  const active = isNavItemActive(pathname, locale, item);
  const label = navItemLabel(item, messages);
  return (
    <Link
      className="cq-task-link"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={item.key === 'dashboard' ? messages.nav.dashboard : undefined}
      href={navItemHref(locale, item)}
      onClick={onNavigate}
    >
      <WorkspaceIcon name={item.icon} />
      <span>{label}</span>
    </Link>
  );
}

function SessionChip({
  phase,
  profile,
  messages,
}: {
  phase: SessionPhase;
  profile: MeProfile | null;
  messages: WorkspaceMessages;
}) {
  const sessionLabel = sessionLabelFor(phase, messages);
  const identity = profile
    ? `${profile.firstName} ${profile.lastName} · ${messages.roles[profile.role]}`
    : sessionLabel;
  return (
    <div className="cq-session-chip" title={sessionLabel}>
      <span className="cq-session-dot" data-phase={phase} aria-hidden="true" />
      {profile ? <strong>{identity}</strong> : <span>{identity}</span>}
    </div>
  );
}

function WorkspaceMobileHeader({
  messages,
  profile,
  sessionLabel,
  homeHref,
  navigationOpen,
  theme,
  onToggleTheme,
  onToggleNavigation,
  toggleRef,
}: {
  messages: WorkspaceMessages;
  profile: MeProfile | null;
  sessionLabel: string;
  homeHref: string;
  navigationOpen: boolean;
  theme: ThemePreference;
  onToggleTheme: () => void;
  onToggleNavigation: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="cq-mobile-header">
      <div className="cq-mobile-brand">
        <BrandMark href={homeHref} variant="compact" />
        <span>{profile ? messages.roles[profile.role] : sessionLabel}</span>
      </div>
      <div className="cq-mobile-tools">
        <button
          type="button"
          className="cq-chrome-icon-button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? messages.themeToLight : messages.themeToDark}
          title={theme === 'dark' ? messages.themeToLight : messages.themeToDark}
        >
          <ChromeGlyph name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          ref={toggleRef}
          type="button"
          className="cq-nav-toggle"
          aria-expanded={navigationOpen}
          aria-controls="workspace-navigation"
          onClick={onToggleNavigation}
          aria-label={navigationOpen ? messages.closeNavigation : messages.openNavigation}
        >
          <WorkspaceIcon name="menu" />
          <span>{navigationOpen ? messages.closeNavigation : messages.navigationMenu}</span>
        </button>
      </div>
    </header>
  );
}

function SessionPanel({
  phase,
  profile,
  messages,
  locale,
  refresh,
}: {
  phase: SessionPhase;
  profile: MeProfile | null;
  messages: WorkspaceMessages;
  locale: string;
  refresh: () => void;
}) {
  const sessionLabel = sessionLabelFor(phase, messages);
  return (
    <div className="cq-session-panel" aria-live="polite">
      <span className="cq-session-state" data-phase={phase}>
        <span aria-hidden="true" />
        {sessionLabel}
      </span>
      {profile ? (
        <div className="cq-session-person">
          <strong>{`${profile.firstName} ${profile.lastName}`}</strong>
          <span>{messages.roles[profile.role]}</span>
          <span>{`${messages.organizationUnit}: ${profile.organizationUnitId}`}</span>
        </div>
      ) : null}
      {phase === 'error' || phase === 'offline' ? (
        <button type="button" className="cq-session-retry" onClick={refresh}>
          {messages.sessionRetry}
        </button>
      ) : null}
      <Link className="cq-session-settings" href={`/${locale}/settings`}>
        {messages.sessionSettings}
      </Link>
    </div>
  );
}

function formatFreshness(lastSuccessfulAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(lastSuccessfulAt));
}

export function WorkspaceChrome({
  assignment,
  children,
  locale,
  altLocale,
  pathname,
  messages,
  phase,
  profile,
  lastSuccessfulAt,
  refresh,
}: WorkspaceChromeProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [shortcut, setShortcut] = useState('Ctrl K');
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationPanelRef = useRef<HTMLElement>(null);
  const homeHref = `/${locale}/dashboard`;
  const sessionLabel = sessionLabelFor(phase, messages);
  const groups = getVisibleNavGroups(profile);
  const commandItems = [...groups.flatMap((group) => group.items), SETTINGS_ITEM];
  const section = activeSectionLabel(pathname, locale, profile, messages);

  const closeNavigation = useCallback(() => {
    setNavigationOpen((wasOpen) => {
      if (wasOpen) navigationToggleRef.current?.focus();
      return false;
    });
  }, []);
  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    commandTriggerRef.current?.focus();
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(toggleThemePreference());
  }, []);

  useEffect(() => {
    const storedTheme = getStoredPreference(THEME_PREFERENCE_SLOT, 'system') as ThemePreference;
    setTheme(
      storedTheme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : storedTheme,
    );
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘ K');
  }, []);

  useEffect(() => {
    if (!navigationOpen) return undefined;
    const panel = navigationPanelRef.current;
    const focusable = Array.from(
      panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    (
      panel?.querySelector<HTMLElement>('.cq-task-link[data-active], .cq-task-link') ?? focusable[0]
    )?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeNavigation();
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) return;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigationOpen, closeNavigation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (commandOpen) closeCommand();
        else setCommandOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [commandOpen, closeCommand]);

  return (
    <>
      <WorkspaceMobileHeader
        messages={messages}
        profile={profile}
        sessionLabel={sessionLabel}
        homeHref={homeHref}
        navigationOpen={navigationOpen}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleNavigation={() => setNavigationOpen((value) => !value)}
        toggleRef={navigationToggleRef}
      />
      <div className="cq-app-shell" data-navigation-open={navigationOpen || undefined}>
        <aside
          ref={navigationPanelRef}
          id="workspace-navigation"
          className="cq-chrome cq-app-sidebar"
          aria-label={messages.title}
        >
          <div className="cq-sidebar-brand">
            <BrandMark href={homeHref} descriptor={messages.brandDescriptor} />
          </div>
          <nav className="cq-task-nav" aria-label={messages.title}>
            {groups.map((group) => (
              <div className="cq-nav-group" key={group.key}>
                <p className="cq-nav-group-label">{messages[group.labelKey]}</p>
                {group.items.map((item) => (
                  <TaskNavLink
                    key={item.path}
                    item={item}
                    locale={locale}
                    pathname={pathname}
                    messages={messages}
                    onNavigate={closeNavigation}
                  />
                ))}
              </div>
            ))}
          </nav>
          <div className="cq-sidebar-foot">
            {profile ? <AssignmentSelector context={assignment} messages={messages} /> : null}
            <SessionPanel
              phase={phase}
              profile={profile}
              messages={messages}
              locale={locale}
              refresh={refresh}
            />
            <div className="cq-sidebar-tools">
              <Suspense
                fallback={<span className="cq-locale-switch">{altLocale.toUpperCase()}</span>}
              >
                <LocaleSwitchLink
                  locale={locale}
                  targetLocale={altLocale}
                  label={altLocale.toUpperCase()}
                />
              </Suspense>
              <Link
                className="cq-session-settings"
                href={navItemHref(locale, SETTINGS_ITEM)}
                data-active={isNavItemActive(pathname, locale, SETTINGS_ITEM) || undefined}
                aria-current={isNavItemActive(pathname, locale, SETTINGS_ITEM) ? 'page' : undefined}
                onClick={closeNavigation}
              >
                <WorkspaceIcon name="settings" />
                <span>{messages.nav.settings}</span>
              </Link>
            </div>
          </div>
        </aside>
        <div className="cq-shell-content">
          <header className="cq-topbar">
            <p className="cq-topbar-context">
              <span>{messages.universityName}</span>
              <strong>{section}</strong>
            </p>
            <button
              ref={commandTriggerRef}
              type="button"
              className="cq-command-trigger"
              onClick={() => setCommandOpen(true)}
              aria-haspopup="dialog"
            >
              <ChromeGlyph name="search" />
              <span>{messages.commandOpen}</span>
              <kbd>{shortcut}</kbd>
            </button>
            <button
              type="button"
              className="cq-chrome-icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? messages.themeToLight : messages.themeToDark}
              title={theme === 'dark' ? messages.themeToLight : messages.themeToDark}
            >
              <ChromeGlyph name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <SessionChip phase={phase} profile={profile} messages={messages} />
            <span className="cq-topbar-meta">
              Europe/Berlin
              {lastSuccessfulAt != null ? ` · ${formatFreshness(lastSuccessfulAt, locale)}` : ''}
            </span>
          </header>
          <main id="main-content" className="cq-app-main" inert={navigationOpen || undefined}>
            {children}
          </main>
        </div>
      </div>
      {navigationOpen ? (
        <button
          type="button"
          className="cq-navigation-scrim"
          aria-label={messages.closeNavigation}
          onClick={closeNavigation}
        />
      ) : null}
      <CommandPalette
        locale={locale}
        messages={messages}
        items={commandItems}
        open={commandOpen}
        onClose={closeCommand}
        onToggleTheme={toggleTheme}
      />
    </>
  );
}
