import type { MeProfile, NavItem, WorkspaceMessages } from './types';

const TODAY_ITEM: NavItem = { key: 'dashboard', path: 'dashboard', icon: 'dashboard' };

const TIME_ITEMS: readonly NavItem[] = [
  { key: 'bookings', path: 'bookings', icon: 'bookings' },
  { key: 'leave', path: 'leave', icon: 'leave' },
  {
    key: 'teamCalendar',
    path: 'team-calendar',
    icon: 'team-calendar',
    roles: ['EMPLOYEE', 'TEAM_LEAD', 'SHIFT_PLANNER', 'HR'],
  },
];

const PLANNING_ITEMS: readonly NavItem[] = [
  { key: 'roster', path: 'roster', icon: 'roster' },
  { key: 'oncall', path: 'oncall', icon: 'oncall' },
];

const DECISION_ITEMS: readonly NavItem[] = [
  {
    key: 'approvals',
    path: 'approvals',
    icon: 'approvals',
    roles: ['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN'],
  },
  { key: 'closing', path: 'closing', icon: 'closing', roles: ['TEAM_LEAD', 'HR', 'ADMIN'] },
  { key: 'policyAdmin', path: 'policy-admin', icon: 'policy', roles: ['HR', 'ADMIN'] },
  {
    key: 'timeEngine',
    path: 'time-engine',
    icon: 'time-engine',
    roles: ['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN'],
  },
];

const INSIGHT_ITEMS: readonly NavItem[] = [
  {
    key: 'reports',
    path: 'reports',
    icon: 'reports',
    roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'DATA_PROTECTION', 'WORKS_COUNCIL'],
  },
  { key: 'audit', path: 'audit', icon: 'audit', roles: ['HR', 'ADMIN', 'DATA_PROTECTION'] },
];

export const SETTINGS_ITEM: NavItem = { key: 'settings', path: 'settings', icon: 'settings' };

/** Flat task-nav order: all primary destinations except settings (chrome action). */
export const TASK_NAV_ITEMS: readonly NavItem[] = [
  TODAY_ITEM,
  ...TIME_ITEMS,
  ...PLANNING_ITEMS,
  ...DECISION_ITEMS,
  ...INSIGHT_ITEMS,
];

function canView(item: NavItem, profile: MeProfile | null): boolean {
  return !item.roles || Boolean(profile && item.roles.includes(profile.role));
}

export function navItemHref(locale: string, item: NavItem): string {
  return `/${locale}/${item.path}`;
}

export function isNavItemActive(pathname: string, locale: string, item: NavItem): boolean {
  const href = navItemHref(locale, item);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getVisibleNavItems(
  items: readonly NavItem[],
  profile: MeProfile | null,
): NavItem[] {
  return items.filter((item) => canView(item, profile));
}

export function navItemLabel(item: NavItem, messages: WorkspaceMessages): string {
  if (item.key === 'dashboard') {
    return messages.todaySection;
  }
  return messages.nav[item.key] ?? item.key;
}

export function activeSectionLabel(
  pathname: string,
  locale: string,
  profile: MeProfile | null,
  messages: WorkspaceMessages,
): string {
  if (isNavItemActive(pathname, locale, SETTINGS_ITEM)) {
    return messages.nav.settings ?? messages.settingsSection;
  }
  for (const item of getVisibleNavItems(TASK_NAV_ITEMS, profile)) {
    if (isNavItemActive(pathname, locale, item)) {
      return navItemLabel(item, messages);
    }
  }
  return messages.todaySection;
}
