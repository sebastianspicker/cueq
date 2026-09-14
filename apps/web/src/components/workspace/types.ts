import type { WorkspaceIconName } from '../WorkspaceIcon';

export type CueqRole =
  | 'EMPLOYEE'
  | 'TEAM_LEAD'
  | 'SHIFT_PLANNER'
  | 'HR'
  | 'PAYROLL'
  | 'ADMIN'
  | 'DATA_PROTECTION'
  | 'WORKS_COUNCIL';

export interface MeProfile {
  id: string;
  email: string;
  role: CueqRole;
  organizationUnitId: string;
  firstName: string;
  lastName: string;
}

export type SessionPhase = 'loading' | 'ready' | 'error' | 'offline';

export interface SessionState {
  assignmentId: string | null;
  phase: SessionPhase;
  profile: MeProfile | null;
  lastSuccessfulAt: number | null;
  refresh: () => void;
}

export interface WorkspaceMessages {
  assignmentLabel: string;
  assignmentRequired: string;
  assignmentLegacy: string;
  assignmentInactive: string;
  assignmentLoading: string;
  assignmentError: string;
  assignmentEmpty: string;
  assignmentMore: string;
  title: string;
  brandDescriptor: string;
  universityName: string;
  workforceSection: string;
  operationsSection: string;
  todaySection: string;
  timeSection: string;
  planningSection: string;
  decisionsSection: string;
  insightsSection: string;
  settingsSection: string;
  skipLink: string;
  localeSwitch: string;
  errorTitle: string;
  errorRetry: string;
  openNavigation: string;
  closeNavigation: string;
  navigationMenu: string;
  sessionLoading: string;
  sessionReady: string;
  sessionOffline: string;
  sessionError: string;
  sessionRetry: string;
  sessionSettings: string;
  commandSearch: string;
  commandPlaceholder: string;
  commandNoResults: string;
  commandOpen: string;
  commandClose: string;
  commandTheme: string;
  themeToDark: string;
  themeToLight: string;
  organizationUnit: string;
  nav: Record<string, string>;
  roles: Record<CueqRole, string>;
}

export interface AppWorkspaceProps {
  children: React.ReactNode;
  locale: string;
  altLocale: string;
  messages: WorkspaceMessages;
}

export interface NavItem {
  key: string;
  path: string;
  icon: WorkspaceIconName;
  roles?: readonly CueqRole[];
}

export interface NavGroup {
  key: 'time' | 'planning' | 'decisions' | 'insights';
  labelKey: 'timeSection' | 'planningSection' | 'decisionsSection' | 'insightsSection';
  items: readonly NavItem[];
}
