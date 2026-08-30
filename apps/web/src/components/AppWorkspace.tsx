'use client';

/** Authenticated application shell that loads session profile data for navigation UX; API authorization remains authoritative. */

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useApiContext } from '../platform/http/api-context';
import { ErrorBoundary } from './ErrorBoundary';
import {
  SessionContext,
  useCurrentSession,
  useOptionalSessionContext,
  useSessionContext,
  WorkspaceChrome,
  type AppWorkspaceProps,
  type CueqRole,
  type SessionState,
} from './workspace';

export type { CueqRole, SessionState, AppWorkspaceProps };
export { useSessionContext, useOptionalSessionContext };

export function AppWorkspace({ children, locale, altLocale, messages }: AppWorkspaceProps) {
  const pathname = usePathname();
  const { apiRequest, connectionKey } = useApiContext();
  const { profile, phase, lastSuccessfulAt, refresh } = useCurrentSession(
    apiRequest,
    connectionKey,
  );

  const session = useMemo<SessionState>(
    () => ({ phase, profile, lastSuccessfulAt, refresh }),
    [lastSuccessfulAt, phase, profile, refresh],
  );

  return (
    <SessionContext.Provider value={session}>
      <a className="cq-skip-link" href="#main-content">
        {messages.skipLink}
      </a>
      <WorkspaceChrome
        locale={locale}
        altLocale={altLocale}
        pathname={pathname}
        messages={messages}
        phase={phase}
        profile={profile}
        lastSuccessfulAt={lastSuccessfulAt}
        refresh={refresh}
      >
        <ErrorBoundary fallbackTitle={messages.errorTitle} fallbackAction={messages.errorRetry}>
          {children}
        </ErrorBoundary>
      </WorkspaceChrome>
    </SessionContext.Provider>
  );
}
