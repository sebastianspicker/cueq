'use client';

import { activeSectionLabel } from './nav-items';
import type { MeProfile, SessionPhase, WorkspaceMessages } from './types';
import { sessionLabelFor } from './use-current-session';

interface WorkspaceStatusMastProps {
  locale: string;
  pathname: string;
  messages: WorkspaceMessages;
  phase: SessionPhase;
  profile: MeProfile | null;
  lastSuccessfulAt: number | null;
}

function formatFreshness(lastSuccessfulAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(lastSuccessfulAt));
}

export function WorkspaceStatusMast({
  locale,
  pathname,
  messages,
  phase,
  profile,
  lastSuccessfulAt,
}: WorkspaceStatusMastProps) {
  const section = activeSectionLabel(pathname, locale, profile, messages);
  const sessionLabel = sessionLabelFor(phase, messages);

  return (
    <div className="cq-status-mast" aria-live="polite">
      <div className="cq-status-mast-left">
        <span className="cq-status-crumb">
          {messages.universityName}
          {' · '}
          <strong>{section}</strong>
        </span>
        <span className="cq-status-pill" data-phase={phase}>
          {sessionLabel}
        </span>
        <span className="cq-status-pill">Europe/Berlin</span>
      </div>
      {lastSuccessfulAt != null ? (
        <div className="cq-status-mast-right">
          <span className="cq-status-pill">{formatFreshness(lastSuccessfulAt, locale)}</span>
        </div>
      ) : null}
    </div>
  );
}
