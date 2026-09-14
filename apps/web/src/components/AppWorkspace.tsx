'use client';

/** Authenticated application shell that loads session profile data for navigation UX; API authorization remains authoritative. */

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ScopedApiProvider, useApiContext } from '../platform/http/api-context';
import { createAssignmentRequest } from '../platform/http/assignment-request';
import { useAssignmentContext } from './workspace/use-assignment-context';
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

  const identity = `${connectionKey}|${profile?.id ?? ''}`;
  const assignment = useAssignmentContext(
    apiRequest,
    identity,
    phase === 'ready' && profile !== null,
  );
  const scopedRequest = useMemo(
    () =>
      createAssignmentRequest(
        apiRequest,
        assignment.selectedId,
        profile?.id ?? null,
        messages.assignmentRequired,
      ),
    [apiRequest, assignment.selectedId, profile?.id, messages.assignmentRequired],
  );

  const session = useMemo<SessionState>(
    () => ({ phase, profile, lastSuccessfulAt, refresh, assignmentId: assignment.selectedId }),
    [lastSuccessfulAt, phase, profile, refresh, assignment.selectedId],
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
        assignment={assignment}
      >
        <ErrorBoundary
          key={
            pathname === `/${locale}/settings`
              ? 'settings'
              : `${identity}|${assignment.selectedId ?? ''}`
          }
          fallbackTitle={messages.errorTitle}
          fallbackAction={messages.errorRetry}
        >
          <ScopedApiProvider apiRequest={scopedRequest}>{children}</ScopedApiProvider>
        </ErrorBoundary>
      </WorkspaceChrome>
    </SessionContext.Provider>
  );
}
