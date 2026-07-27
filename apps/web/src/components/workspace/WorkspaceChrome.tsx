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
import { BrandMark } from '../BrandMark';
import { LocaleSwitchLink } from '../LocaleSwitchLink';
import { WorkspaceIcon } from '../WorkspaceIcon';
import {
  getVisibleNavItems,
  isNavItemActive,
  navItemHref,
  navItemLabel,
  SETTINGS_ITEM,
  TASK_NAV_ITEMS,
} from './nav-items';
import type { MeProfile, NavItem, SessionPhase, WorkspaceMessages } from './types';
import { sessionLabelFor } from './use-current-session';
import { WorkspaceStatusMast } from './WorkspaceStatusMast';

interface WorkspaceChromeProps {
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
  const href = navItemHref(locale, item);
  const active = isNavItemActive(pathname, locale, item);
  const label = navItemLabel(item, messages);
  // Dashboard visible label is the today section; keep nav.dashboard as accessible name for tests/a11y.
  const accessibleName = item.key === 'dashboard' ? messages.nav.dashboard : undefined;

  return (
    <Link
      className="cq-task-link"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={accessibleName}
      href={href}
      onClick={onNavigate}
    >
      <WorkspaceIcon name={item.icon} />
      {label}
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
  // Single text node for name+role so getByText('First Last') stays unique to .cq-session-person.
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
  onToggleNavigation,
  toggleRef,
}: {
  messages: WorkspaceMessages;
  profile: MeProfile | null;
  sessionLabel: string;
  homeHref: string;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="cq-mobile-header">
      <div className="cq-mobile-brand">
        <BrandMark href={homeHref} variant="compact" />
        <span>{profile ? messages.roles[profile.role] : sessionLabel}</span>
      </div>
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

/**
 * Rhein-Desk chrome: one task-nav tree (desktop top bar + mobile drawer via CSS),
 * session chip/actions, status mast, and main content.
 */
export function WorkspaceChrome({
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
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const navigationPanelRef = useRef<HTMLElement>(null);
  const homeHref = `/${locale}/dashboard`;
  const sessionLabel = sessionLabelFor(phase, messages);
  const visibleTasks = getVisibleNavItems(TASK_NAV_ITEMS, profile);
  const settingsActive = isNavItemActive(pathname, locale, SETTINGS_ITEM);

  const closeNavigation = useCallback(() => {
    setNavigationOpen((wasOpen) => {
      if (wasOpen) {
        navigationToggleRef.current?.focus();
      }
      return false;
    });
  }, []);

  useEffect(() => {
    if (!navigationOpen) {
      return undefined;
    }
    const navigationPanel = navigationPanelRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(
      navigationPanel?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    const initialFocus = navigationPanel?.querySelector<HTMLElement>(
      '.cq-task-link[data-active], .cq-task-link',
    );
    (initialFocus ?? focusableElements[0])?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeNavigation();
        return;
      }
      if (event.key !== 'Tab' || focusableElements.length === 0) {
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigationOpen, closeNavigation]);

  return (
    <>
      <WorkspaceMobileHeader
        messages={messages}
        profile={profile}
        sessionLabel={sessionLabel}
        homeHref={homeHref}
        navigationOpen={navigationOpen}
        onToggleNavigation={() => setNavigationOpen((value) => !value)}
        toggleRef={navigationToggleRef}
      />

      <div className="cq-app-shell" data-navigation-open={navigationOpen || undefined}>
        {/*
          Single navigation tree: cq-chrome for desktop top bar, cq-app-sidebar for
          mobile off-canvas via CSS. Avoids duplicate links for role queries.
        */}
        <header
          ref={navigationPanelRef}
          id="workspace-navigation"
          className="cq-chrome cq-app-sidebar"
          aria-label={messages.title}
        >
          <div className="cq-chrome-top">
            <BrandMark href={homeHref} descriptor={messages.brandDescriptor} />

            <nav className="cq-task-nav" aria-label={messages.title}>
              {visibleTasks.map((item) => (
                <TaskNavLink
                  key={item.path}
                  item={item}
                  locale={locale}
                  pathname={pathname}
                  messages={messages}
                  onNavigate={closeNavigation}
                />
              ))}
            </nav>

            <div className="cq-chrome-actions">
              <Suspense
                fallback={<span className="cq-locale-switch">{altLocale.toUpperCase()}</span>}
              >
                <LocaleSwitchLink
                  locale={locale}
                  targetLocale={altLocale}
                  label={altLocale.toUpperCase()}
                />
              </Suspense>
              <SessionChip phase={phase} profile={profile} messages={messages} />
              <Link
                className="cq-session-settings"
                href={navItemHref(locale, SETTINGS_ITEM)}
                data-active={settingsActive || undefined}
                aria-current={settingsActive ? 'page' : undefined}
                aria-label={messages.nav.settings}
                onClick={closeNavigation}
              >
                <WorkspaceIcon name="settings" />
              </Link>
            </div>
          </div>

          <div className="cq-brand">
            <p className="cq-brand-institution">{messages.universityName}</p>
          </div>

          <SessionPanel
            phase={phase}
            profile={profile}
            messages={messages}
            locale={locale}
            refresh={refresh}
          />

          <div className="cq-locale-panel">
            <span>{messages.localeSwitch}</span>
            <Suspense
              fallback={<span className="cq-locale-switch">{altLocale.toUpperCase()}</span>}
            >
              <LocaleSwitchLink
                locale={locale}
                targetLocale={altLocale}
                label={altLocale.toUpperCase()}
              />
            </Suspense>
          </div>
        </header>

        <WorkspaceStatusMast
          locale={locale}
          pathname={pathname}
          messages={messages}
          phase={phase}
          profile={profile}
          lastSuccessfulAt={lastSuccessfulAt}
        />

        <main id="main-content" className="cq-app-main" inert={navigationOpen || undefined}>
          {children}
        </main>
      </div>

      {navigationOpen ? (
        <button
          type="button"
          className="cq-navigation-scrim"
          aria-label={messages.closeNavigation}
          onClick={closeNavigation}
        />
      ) : null}
    </>
  );
}
