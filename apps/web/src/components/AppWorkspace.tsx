'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useApiContext } from '../lib/api-context';
import { ErrorBoundary } from './ErrorBoundary';
import { LocaleSwitchLink } from './LocaleSwitchLink';

export type CueqRole =
  | 'EMPLOYEE'
  | 'TEAM_LEAD'
  | 'SHIFT_PLANNER'
  | 'HR'
  | 'PAYROLL'
  | 'ADMIN'
  | 'DATA_PROTECTION'
  | 'WORKS_COUNCIL';

interface MeProfile {
  id: string;
  email: string;
  role: CueqRole;
  organizationUnitId: string;
  firstName: string;
  lastName: string;
}

type SessionPhase = 'loading' | 'ready' | 'error' | 'offline';

interface SessionState {
  phase: SessionPhase;
  profile: MeProfile | null;
  lastSuccessfulAt: number | null;
  refresh: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function useSessionContext(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSessionContext must be used within AppWorkspace.');
  }
  return value;
}

interface WorkspaceMessages {
  title: string;
  subtitle: string;
  universityName: string;
  workforceSection: string;
  operationsSection: string;
  settingsSection: string;
  skipLink: string;
  localeSwitch: string;
  errorTitle: string;
  errorRetry: string;
  openNavigation: string;
  closeNavigation: string;
  sessionLoading: string;
  sessionReady: string;
  sessionOffline: string;
  sessionError: string;
  sessionRetry: string;
  sessionSettings: string;
  organizationUnit: string;
  nav: Record<string, string>;
  roles: Record<CueqRole, string>;
}

interface AppWorkspaceProps {
  children: React.ReactNode;
  locale: string;
  altLocale: string;
  messages: WorkspaceMessages;
}

interface NavItem {
  key: string;
  path: string;
  roles?: readonly CueqRole[];
}

const WORKFORCE_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', path: 'dashboard' },
  { key: 'bookings', path: 'bookings' },
  { key: 'leave', path: 'leave' },
  { key: 'teamCalendar', path: 'team-calendar' },
  { key: 'roster', path: 'roster' },
  { key: 'oncall', path: 'oncall' },
];

const OPERATIONS_ITEMS: readonly NavItem[] = [
  {
    key: 'approvals',
    path: 'approvals',
    roles: ['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN'],
  },
  { key: 'closing', path: 'closing', roles: ['TEAM_LEAD', 'HR', 'ADMIN'] },
  {
    key: 'reports',
    path: 'reports',
    roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'DATA_PROTECTION', 'WORKS_COUNCIL'],
  },
  { key: 'policyAdmin', path: 'policy-admin', roles: ['HR', 'ADMIN'] },
  {
    key: 'timeEngine',
    path: 'time-engine',
    roles: ['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN'],
  },
  { key: 'audit', path: 'audit', roles: ['HR', 'ADMIN', 'DATA_PROTECTION'] },
];

function canView(item: NavItem, profile: MeProfile | null): boolean {
  return !item.roles || Boolean(profile && item.roles.includes(profile.role));
}

function NavigationGroup({
  items,
  label,
  locale,
  pathname,
  profile,
  messages,
  onNavigate,
}: {
  items: readonly NavItem[];
  label: string;
  locale: string;
  pathname: string;
  profile: MeProfile | null;
  messages: WorkspaceMessages;
  onNavigate: () => void;
}) {
  const visibleItems = items.filter((item) => canView(item, profile));
  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="cq-nav-block">
      <p className="cq-nav-group-title">{label}</p>
      <nav className="cq-app-nav" aria-label={label}>
        {visibleItems.map((item) => {
          const href = `/${locale}/${item.path}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.path}
              className="cq-nav-link"
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              href={href}
              onClick={onNavigate}
            >
              {messages.nav[item.key]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

interface WorkspaceMobileHeaderProps {
  messages: WorkspaceMessages;
  profile: MeProfile | null;
  sessionLabel: string;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
}

function WorkspaceMobileHeader({
  messages,
  profile,
  sessionLabel,
  navigationOpen,
  onToggleNavigation,
}: WorkspaceMobileHeaderProps) {
  return (
    <header className="cq-mobile-header">
      <div>
        <strong>{messages.title}</strong>
        <span>{profile ? messages.roles[profile.role] : sessionLabel}</span>
      </div>
      <button
        type="button"
        className="cq-nav-toggle"
        aria-expanded={navigationOpen}
        aria-controls="workspace-navigation"
        onClick={onToggleNavigation}
      >
        {navigationOpen ? messages.closeNavigation : messages.openNavigation}
      </button>
    </header>
  );
}

function failurePhase(): SessionPhase {
  return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
}

function sessionLabelFor(phase: SessionPhase, messages: WorkspaceMessages): string {
  const labels: Record<SessionPhase, string> = {
    loading: messages.sessionLoading,
    ready: messages.sessionReady,
    offline: messages.sessionOffline,
    error: messages.sessionError,
  };
  return labels[phase];
}

function useCurrentSession(
  apiRequest: ReturnType<typeof useApiContext>['apiRequest'],
  key: string,
) {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    if (failurePhase() === 'offline') {
      setPhase('offline');
      return () => controller.abort();
    }

    setPhase('loading');
    apiRequest<MeProfile>('/v1/me', { signal: controller.signal })
      .then((nextProfile) => {
        setProfile(nextProfile);
        setLastSuccessfulAt(Date.now());
        setPhase('ready');
      })
      .catch((cause: unknown) => {
        const aborted = cause instanceof DOMException && cause.name === 'AbortError';
        if (!aborted) {
          setPhase(failurePhase());
        }
      });
    return () => controller.abort();
  }, [apiRequest, key, refreshNonce]);

  useEffect(() => {
    const handleOffline = () => setPhase('offline');
    const handleOnline = () => refresh();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [refresh]);

  return { profile, phase, lastSuccessfulAt, refresh };
}

export function AppWorkspace({ children, locale, altLocale, messages }: AppWorkspaceProps) {
  const pathname = usePathname();
  const { apiRequest, connectionKey } = useApiContext();
  const { profile, phase, lastSuccessfulAt, refresh } = useCurrentSession(
    apiRequest,
    connectionKey,
  );
  const [navigationOpen, setNavigationOpen] = useState(false);

  const session = useMemo<SessionState>(
    () => ({ phase, profile, lastSuccessfulAt, refresh }),
    [lastSuccessfulAt, phase, profile, refresh],
  );
  const sessionLabel = sessionLabelFor(phase, messages);

  return (
    <SessionContext.Provider value={session}>
      <a className="cq-skip-link" href="#main-content">
        {messages.skipLink}
      </a>
      <WorkspaceMobileHeader
        messages={messages}
        profile={profile}
        sessionLabel={sessionLabel}
        navigationOpen={navigationOpen}
        onToggleNavigation={() => setNavigationOpen((value) => !value)}
      />
      <div className="cq-app-shell" data-navigation-open={navigationOpen || undefined}>
        <aside id="workspace-navigation" className="cq-app-sidebar" aria-label={messages.title}>
          <div className="cq-brand">
            <p className="cq-brand-overline">{messages.universityName}</p>
            <h1>{messages.title}</h1>
            <p>{messages.subtitle}</p>
          </div>

          <NavigationGroup
            items={WORKFORCE_ITEMS}
            label={messages.workforceSection}
            locale={locale}
            pathname={pathname}
            profile={profile}
            messages={messages}
            onNavigate={() => setNavigationOpen(false)}
          />
          <NavigationGroup
            items={OPERATIONS_ITEMS}
            label={messages.operationsSection}
            locale={locale}
            pathname={pathname}
            profile={profile}
            messages={messages}
            onNavigate={() => setNavigationOpen(false)}
          />

          <div className="cq-nav-block cq-nav-settings">
            <p className="cq-nav-group-title">{messages.settingsSection}</p>
            <nav className="cq-app-nav" aria-label={messages.settingsSection}>
              <Link
                className="cq-nav-link"
                data-active={pathname.endsWith('/settings') || undefined}
                aria-current={pathname.endsWith('/settings') ? 'page' : undefined}
                href={`/${locale}/settings`}
                onClick={() => setNavigationOpen(false)}
              >
                {messages.nav.settings}
              </Link>
            </nav>
          </div>

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
        </aside>

        <main id="main-content" className="cq-app-main">
          <ErrorBoundary fallbackTitle={messages.errorTitle} fallbackAction={messages.errorRetry}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
      {navigationOpen ? (
        <button
          type="button"
          className="cq-navigation-scrim"
          aria-label={messages.closeNavigation}
          onClick={() => setNavigationOpen(false)}
        />
      ) : null}
    </SessionContext.Provider>
  );
}
