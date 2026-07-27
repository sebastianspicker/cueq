import type { ReactNode } from 'react';

export type WorkspaceIconName =
  | 'approvals'
  | 'audit'
  | 'bookings'
  | 'closing'
  | 'dashboard'
  | 'leave'
  | 'menu'
  | 'oncall'
  | 'policy'
  | 'reports'
  | 'roster'
  | 'settings'
  | 'team-calendar'
  | 'time-engine';

const ICON_PATHS: Record<WorkspaceIconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M12 13v4l3 2" />
    </>
  ),
  leave: (
    <>
      <rect x="3" y="6" width="18" height="15" rx="2" />
      <path d="M8 6V4h8v2M8 12h8" />
    </>
  ),
  'team-calendar': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2" />
    </>
  ),
  roster: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  oncall: (
    <path d="M6.6 3.8 9.3 3l2 5-2.1 1.4a15 15 0 0 0 5.4 5.4l1.4-2.1 5 2-.8 2.7a3 3 0 0 1-3.4 2.1A16.8 16.8 0 0 1 4.5 7.2 3 3 0 0 1 6.6 3.8Z" />
  ),
  approvals: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  closing: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" />
    </>
  ),
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  policy: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  'time-engine': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2M4 4l2 2M20 4l-2 2" />
    </>
  ),
  audit: (
    <>
      <path d="M5 3h10l4 4v14H5Z" />
      <path d="M15 3v5h4M8 12h5M8 16h3" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

function IconPaths({ name }: { name: WorkspaceIconName }) {
  return ICON_PATHS[name];
}

/** Provides a consistent dependency-free outline icon for workspace chrome. */
export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return (
    <svg
      className="cq-workspace-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <IconPaths name={name} />
    </svg>
  );
}
