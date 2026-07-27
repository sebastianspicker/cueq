import type { Page, Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const IDS = {
  ouAdmin: 'c000000000000000000000001',
  ouSecurity: 'c000000000000000000000002',
  employee: 'c000000000000000000000100',
  lead: 'c000000000000000000000101',
  planner: 'c000000000000000000000102',
  hr: 'c000000000000000000000103',
  security1: 'c000000000000000000000106',
  security2: 'c000000000000000000000107',
  security3: 'c000000000000000000000108',
  security4: 'c000000000000000000000109',
  timeTypeWork: 'c000000000000000000000200',
  roster: 'c000000000000000000000300',
  shiftNight: 'c000000000000000000000301',
  shiftMorning: 'c000000000000000000000302',
  shiftLate: 'c000000000000000000000303',
  assignmentNightPlanner: 'c000000000000000000000401',
  assignmentNightEmployee: 'c000000000000000000000402',
  assignmentMorningEmployee: 'c000000000000000000000403',
  assignmentLateEmployee: 'c000000000000000000000404',
  assignmentLateSecondEmployee: 'c000000000000000000000405',
  absenceRequest: 'c000000000000000000000510',
  workflow: 'c000000000000000000000601',
  closingPeriod: 'c000000000000000000000700',
  exportRun: 'c000000000000000000000701',
} as const;

function mockToken(payload: Record<string, unknown>) {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

export const DEMO_TOKENS = {
  employee: mockToken({
    sub: IDS.employee,
    email: 'employee@cueq.local',
    role: 'EMPLOYEE',
    organizationUnitId: IDS.ouAdmin,
  }),
  lead: mockToken({
    sub: IDS.lead,
    email: 'lead@cueq.local',
    role: 'TEAM_LEAD',
    organizationUnitId: IDS.ouAdmin,
  }),
  planner: mockToken({
    sub: IDS.planner,
    email: 'planner@cueq.local',
    role: 'SHIFT_PLANNER',
    organizationUnitId: IDS.ouSecurity,
  }),
  hr: mockToken({
    sub: IDS.hr,
    email: 'hr@cueq.local',
    role: 'HR',
    organizationUnitId: IDS.ouAdmin,
  }),
} as const;

const PROFILES = new Map([
  [
    DEMO_TOKENS.employee,
    {
      id: IDS.employee,
      email: 'employee@cueq.local',
      role: 'EMPLOYEE',
      organizationUnitId: IDS.ouAdmin,
      firstName: 'Mila',
      lastName: 'Demofall',
    },
  ],
  [
    DEMO_TOKENS.lead,
    {
      id: IDS.lead,
      email: 'lead@cueq.local',
      role: 'TEAM_LEAD',
      organizationUnitId: IDS.ouAdmin,
      firstName: 'Lena',
      lastName: 'Leitung',
    },
  ],
  [
    DEMO_TOKENS.planner,
    {
      id: IDS.planner,
      email: 'planner@cueq.local',
      role: 'SHIFT_PLANNER',
      organizationUnitId: IDS.ouSecurity,
      firstName: 'Pia',
      lastName: 'Planung',
    },
  ],
  [
    DEMO_TOKENS.hr,
    {
      id: IDS.hr,
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: IDS.ouAdmin,
      firstName: 'Hedi',
      lastName: 'Personal',
    },
  ],
]);

const dashboard = {
  personId: IDS.employee,
  modelName: 'Mock University NRW - Flextime Full-time',
  todayTargetHours: 7.8,
  currentBalanceHours: 6.75,
  todayBookingsCount: 2,
  hasFirstBooking: true,
  showOrientation: false,
  clockInTimeTypeId: IDS.timeTypeWork,
  period: {
    start: '2026-03-01T00:00:00.000Z',
    end: '2026-03-31T23:59:59.000Z',
  },
  quickActions: ['CLOCK_IN', 'REQUEST_LEAVE'],
  now: '2026-03-18T14:31:00.000Z',
};

const dashboardBookings = [
  {
    id: 'c000000000000000000000210',
    personId: IDS.employee,
    timeTypeId: IDS.timeTypeWork,
    timeTypeCode: 'WORK',
    timeTypeCategory: 'WORK',
    startTime: '2026-03-18T07:03:00.000Z',
    endTime: '2026-03-18T11:14:00.000Z',
    source: 'WEB',
    note: 'Synthetic dashboard fixture',
    shiftId: null,
    createdAt: '2026-03-18T07:03:00.000Z',
    updatedAt: '2026-03-18T11:14:00.000Z',
  },
  {
    id: 'c000000000000000000000211',
    personId: IDS.employee,
    timeTypeId: IDS.timeTypeWork,
    timeTypeCode: 'WORK',
    timeTypeCategory: 'WORK',
    startTime: '2026-03-18T11:46:00.000Z',
    endTime: null,
    source: 'WEB',
    note: 'Synthetic dashboard fixture',
    shiftId: null,
    createdAt: '2026-03-18T11:46:00.000Z',
    updatedAt: '2026-03-18T11:46:00.000Z',
  },
] as const;

const leaveBalance = {
  personId: IDS.employee,
  year: 2026,
  asOfDate: '2026-12-31',
  entitlement: 30,
  used: 8,
  remaining: 24,
  carriedOver: 2,
  carriedOverUsed: 2,
  forfeited: 0,
  adjustments: 0,
};

const absences = [
  {
    id: IDS.absenceRequest,
    personId: IDS.employee,
    type: 'SPECIAL_LEAVE',
    startDate: '2026-03-18',
    endDate: '2026-03-19',
    days: 2,
    status: 'REQUESTED',
    note: 'Demo request for committee participation',
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 'c000000000000000000000511',
    personId: IDS.employee,
    type: 'TRAINING',
    startDate: '2026-03-24',
    endDate: '2026-03-24',
    days: 1,
    status: 'REJECTED',
    note: 'Demo rejected training request',
    createdAt: '2026-03-11T09:00:00.000Z',
    updatedAt: '2026-03-12T10:00:00.000Z',
  },
];

const roster = {
  id: IDS.roster,
  organizationUnitId: IDS.ouSecurity,
  periodStart: '2026-03-01T00:00:00.000Z',
  periodEnd: '2026-03-31T23:59:59.000Z',
  status: 'PUBLISHED',
  publishedAt: '2026-02-25T10:00:00.000Z',
  members: [
    { id: IDS.planner, firstName: 'Pia', lastName: 'Planung', role: 'SHIFT_PLANNER' },
    { id: IDS.security1, firstName: 'Nora', lastName: 'Nachtwache', role: 'EMPLOYEE' },
    { id: IDS.security2, firstName: 'Felix', lastName: 'Fruehschicht', role: 'EMPLOYEE' },
    { id: IDS.security3, firstName: 'Greta', lastName: 'Guard', role: 'EMPLOYEE' },
    { id: IDS.security4, firstName: 'Timo', lastName: 'Torwache', role: 'EMPLOYEE' },
  ],
  shifts: [
    {
      id: IDS.shiftNight,
      rosterId: IDS.roster,
      personId: IDS.planner,
      startTime: '2026-03-08T22:00:00.000Z',
      endTime: '2026-03-09T06:00:00.000Z',
      shiftType: 'NIGHT',
      minStaffing: 2,
      assignments: [
        {
          id: IDS.assignmentNightPlanner,
          personId: IDS.planner,
          firstName: 'Pia',
          lastName: 'Planung',
        },
        {
          id: IDS.assignmentNightEmployee,
          personId: IDS.security1,
          firstName: 'Nora',
          lastName: 'Nachtwache',
        },
      ],
    },
    {
      id: IDS.shiftMorning,
      rosterId: IDS.roster,
      personId: IDS.security2,
      startTime: '2026-03-10T06:00:00.000Z',
      endTime: '2026-03-10T14:00:00.000Z',
      shiftType: 'EARLY',
      minStaffing: 1,
      assignments: [
        {
          id: IDS.assignmentMorningEmployee,
          personId: IDS.security2,
          firstName: 'Felix',
          lastName: 'Fruehschicht',
        },
      ],
    },
    {
      id: IDS.shiftLate,
      rosterId: IDS.roster,
      personId: IDS.security3,
      startTime: '2026-03-10T14:00:00.000Z',
      endTime: '2026-03-10T22:00:00.000Z',
      shiftType: 'LATE',
      minStaffing: 2,
      assignments: [
        {
          id: IDS.assignmentLateEmployee,
          personId: IDS.security3,
          firstName: 'Greta',
          lastName: 'Guard',
        },
        {
          id: IDS.assignmentLateSecondEmployee,
          personId: IDS.security4,
          firstName: 'Timo',
          lastName: 'Torwache',
        },
      ],
    },
  ],
};

const planVsActual = {
  rosterId: IDS.roster,
  periodStart: roster.periodStart,
  periodEnd: roster.periodEnd,
  totalSlots: 3,
  mismatchedSlots: 0,
  complianceRate: 1,
  understaffedSlots: 0,
  coverageRate: 1,
  slots: roster.shifts.map((shift) => ({
    shiftId: shift.id,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    minStaffing: shift.minStaffing,
    assignedHeadcount: shift.assignments.length,
    plannedHeadcount: shift.assignments.length,
    actualHeadcount: shift.assignments.length,
    delta: 0,
    compliant: true,
  })),
};

const workflow = {
  id: IDS.workflow,
  type: 'LEAVE_REQUEST',
  status: 'PENDING',
  requesterId: IDS.employee,
  approverId: IDS.lead,
  entityType: 'Absence',
  entityId: IDS.absenceRequest,
  reason: 'Urlaubsantrag im Demo-Postfach',
  decisionReason: null,
  submittedAt: '2026-03-17T09:00:00.000Z',
  dueAt: '2026-03-20T08:30:00.000Z',
  escalatedAt: null,
  escalationLevel: 0,
  requestPayload: null,
  delegationTrail: [],
  decidedAt: null,
  createdAt: '2026-03-17T08:55:00.000Z',
  updatedAt: '2026-03-17T09:00:00.000Z',
  isOverdue: true,
  availableActions: ['APPROVE', 'REJECT', 'DELEGATE'],
};

const closingPeriod = {
  id: IDS.closingPeriod,
  organizationUnitId: IDS.ouAdmin,
  periodStart: '2026-03-01T00:00:00.000Z',
  periodEnd: '2026-03-31T23:59:59.000Z',
  status: 'REVIEW',
  leadApprovedAt: null,
  leadApprovedById: null,
  hrApprovedAt: null,
  hrApprovedById: null,
  lockedAt: null,
  lockSource: null,
  exportRuns: [
    {
      id: IDS.exportRun,
      format: 'CSV_V1',
      recordCount: 6,
      checksum: 'demo-csv-v1-2026-03-mock-university',
      exportedAt: '2026-03-31T16:05:00.000Z',
    },
  ],
};

const closingChecklist = {
  closingPeriodId: IDS.closingPeriod,
  status: 'REVIEW',
  hasErrors: false,
  items: [
    {
      code: 'TIME_ACCOUNTS_COMPLETE',
      label: 'Zeitkonten vollständig',
      severity: 'INFO',
      status: 'OK',
      details: 'Alle sechs synthetischen Zeitkonten sind für März 2026 berechnet.',
    },
    {
      code: 'ROSTER_COVERAGE_COMPLETE',
      label: 'Dienstplanabdeckung geprüft',
      severity: 'INFO',
      status: 'OK',
      details: 'Alle geplanten Schichten erfüllen die hinterlegte Mindestbesetzung.',
    },
    {
      code: 'OPEN_WORKFLOWS_REVIEWED',
      label: 'Offene Freigaben geprüft',
      severity: 'WARNING',
      status: 'OK',
      details: 'Eine synthetische Urlaubsfreigabe bleibt zur Demonstration offen.',
    },
  ],
};

const reportResponses = {
  '/api/v1/reports/team-absence': {
    organizationUnitId: IDS.ouAdmin,
    from: '2026-03-01',
    to: '2026-03-31',
    suppression: { suppressed: false, minGroupSize: 5, population: 6 },
    totals: { requests: 4, days: 7 },
    buckets: [
      { type: 'ANNUAL_LEAVE', requests: 1, days: 2 },
      { type: 'SPECIAL_LEAVE', requests: 1, days: 2 },
      { type: 'TRAINING', requests: 2, days: 3 },
    ],
  },
  '/api/v1/reports/oe-overtime': {
    organizationUnitId: IDS.ouSecurity,
    from: '2026-03-01',
    to: '2026-03-31',
    suppression: { suppressed: false, minGroupSize: 5, population: 5 },
    totals: {
      people: 5,
      totalBalanceHours: 7.1,
      totalOvertimeHours: 7.8,
      avgBalanceHours: 1.42,
    },
  },
  '/api/v1/reports/closing-completion': {
    from: '2026-03-01',
    to: '2026-03-31',
    organizationUnitId: null,
    totals: { periods: 1, exported: 1, closed: 0, review: 1, open: 0, completionRate: 1 },
  },
  '/api/v1/reports/audit-summary': {
    from: '2026-03-01',
    to: '2026-03-31',
    totals: {
      entries: 6,
      uniqueActors: 3,
      reportAccesses: 2,
      exportsTriggered: 1,
      lockBlocks: 0,
    },
    byAction: [
      { action: 'REPORT_ACCESSED', count: 2 },
      { action: 'CLOSING_EXPORTED', count: 1 },
    ],
    byEntityType: [
      { entityType: 'Report', count: 2 },
      { entityType: 'ClosingPeriod', count: 1 },
    ],
  },
  '/api/v1/reports/compliance-summary': {
    from: '2026-03-01',
    to: '2026-03-31',
    privacy: {
      minGroupSize: 5,
      reportAccesses: 2,
      suppressedReportAccesses: 1,
      suppressionRate: 0.5,
    },
    closing: {
      periods: 1,
      exported: 1,
      completionRate: 1,
      lockBlocks: 0,
      postCloseCorrections: 0,
    },
    payrollExport: {
      runs: 1,
      uniqueChecksums: 1,
      duplicateChecksums: 0,
      lastRunAt: '2026-03-31T16:05:00.000Z',
    },
    operations: { lastBackupRestoreVerifiedAt: '2026-03-31T17:00:00.000Z' },
  },
} as const;

interface ApiFixtureRoute {
  pathname: string;
  query: Record<string, string>;
  expectedToken: string;
  payload: unknown;
}

const API_FIXTURE_ROUTES: readonly ApiFixtureRoute[] = [
  {
    pathname: '/api/v1/dashboard/me',
    query: {},
    expectedToken: DEMO_TOKENS.employee,
    payload: dashboard,
  },
  {
    pathname: '/api/v1/bookings/me',
    query: {},
    expectedToken: DEMO_TOKENS.employee,
    payload: dashboardBookings,
  },
  {
    pathname: '/api/v1/leave-balance/me',
    query: { year: '2026', asOfDate: '2026-12-31' },
    expectedToken: DEMO_TOKENS.employee,
    payload: leaveBalance,
  },
  {
    pathname: '/api/v1/absences/me',
    query: {},
    expectedToken: DEMO_TOKENS.employee,
    payload: absences,
  },
  {
    pathname: '/api/v1/rosters/current',
    query: {},
    expectedToken: DEMO_TOKENS.planner,
    payload: roster,
  },
  {
    pathname: `/api/v1/rosters/${IDS.roster}/plan-vs-actual`,
    query: {},
    expectedToken: DEMO_TOKENS.planner,
    payload: planVsActual,
  },
  {
    pathname: '/api/v1/workflows/inbox',
    query: {},
    expectedToken: DEMO_TOKENS.lead,
    payload: [workflow],
  },
  {
    pathname: `/api/v1/workflows/${IDS.workflow}`,
    query: {},
    expectedToken: DEMO_TOKENS.lead,
    payload: workflow,
  },
  {
    pathname: '/api/v1/closing-periods',
    query: { from: '2026-03', to: '2026-03' },
    expectedToken: DEMO_TOKENS.hr,
    payload: [closingPeriod],
  },
  {
    pathname: `/api/v1/closing-periods/${IDS.closingPeriod}/checklist`,
    query: {},
    expectedToken: DEMO_TOKENS.hr,
    payload: closingChecklist,
  },
  {
    pathname: `/api/v1/closing-periods/${IDS.closingPeriod}`,
    query: {},
    expectedToken: DEMO_TOKENS.hr,
    payload: closingPeriod,
  },
  ...Object.entries(reportResponses).map(([pathname, payload]) => ({
    pathname,
    query: { from: '2026-03-01', to: '2026-03-31' },
    expectedToken: DEMO_TOKENS.hr,
    payload,
  })),
];

function bearerToken(route: Route): string | null {
  const value = route.request().headers().authorization;
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

function hasExactQuery(url: URL, expected: Record<string, string>): boolean {
  const actual = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const wanted = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actual) === JSON.stringify(wanted);
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function handleApiRoute(route: Route, unexpectedRequests: string[]) {
  const request = route.request();
  const url = new URL(request.url());
  const token = bearerToken(route);
  const requestLabel = `${request.method()} ${url.pathname}${url.search}`;

  if (request.method() !== 'GET') {
    unexpectedRequests.push(requestLabel);
    await json(route, 501, { message: `Unhandled demo request: ${requestLabel}` });
    return;
  }

  if (url.pathname === '/api/v1/me') {
    const profile = token ? PROFILES.get(token) : null;
    await json(route, profile ? 200 : 401, profile ?? { message: 'Synthetic token required.' });
    return;
  }

  const fixture = API_FIXTURE_ROUTES.find(
    ({ pathname, query }) => pathname === url.pathname && hasExactQuery(url, query),
  );
  if (!fixture) {
    unexpectedRequests.push(requestLabel);
    await json(route, 501, { message: `Unhandled demo request: ${requestLabel}` });
    return;
  }

  if (token !== fixture.expectedToken) {
    unexpectedRequests.push(`Forbidden fixture request: ${requestLabel}`);
    await json(route, 403, { message: 'Synthetic role does not match this fixture.' });
    return;
  }

  await json(route, 200, fixture.payload);
}

const BUILD_ROOT = resolve(process.cwd(), '.next');
const STATIC_ROOT = resolve(BUILD_ROOT, 'static');
const APP_ROOT = resolve(BUILD_ROOT, 'server/app');

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function contentType(filePath: string, isRsc: boolean): string {
  if (isRsc) return 'text/x-component; charset=utf-8';
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  return types[extname(filePath)] ?? 'application/octet-stream';
}

async function serveNextBuild(route: Route, unexpectedRequests: string[]) {
  const request = route.request();
  const url = new URL(request.url());
  const decodedPath = decodeURIComponent(url.pathname);
  const isRsc = request.headers().rsc === '1' || url.searchParams.has('_rsc');
  let filePath: string | null = null;
  let allowedRoot: string | null = null;

  if (decodedPath.startsWith('/_next/static/')) {
    filePath = resolve(STATIC_ROOT, decodedPath.slice('/_next/static/'.length));
    allowedRoot = STATIC_ROOT;
  } else if (decodedPath === '/icon.svg') {
    filePath = resolve(APP_ROOT, 'icon.svg.body');
    allowedRoot = APP_ROOT;
  } else if (/^\/(?:de|en)(?:\/[a-z0-9-]+)?\/?$/u.test(decodedPath)) {
    const appPath = decodedPath.replace(/^\//u, '').replace(/\/$/u, '');
    filePath = resolve(APP_ROOT, `${appPath}.${isRsc ? 'rsc' : 'html'}`);
    allowedRoot = APP_ROOT;
  }

  if (!filePath || !allowedRoot || !isWithin(allowedRoot, filePath)) {
    const label = `${request.method()} ${url.pathname}${url.search}`;
    unexpectedRequests.push(`Unhandled build request: ${label}`);
    await route.fulfill({ status: 404, body: 'Not found' });
    return;
  }

  try {
    const body = await readFile(filePath);
    await route.fulfill({
      status: 200,
      contentType: decodedPath === '/icon.svg' ? 'image/svg+xml' : contentType(filePath, isRsc),
      headers: isRsc
        ? {
            'x-nextjs-prerender': '1',
            'x-nextjs-stale-time': '300',
          }
        : undefined,
      body,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    unexpectedRequests.push(`Missing build asset: ${url.pathname} (${message})`);
    await route.fulfill({ status: 404, body: 'Not found' });
  }
}

export async function installMockUniversityFixtureBrowser(
  page: Page,
  unexpectedRequests: string[],
) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/')) {
      await handleApiRoute(route, unexpectedRequests);
      return;
    }
    await serveNextBuild(route, unexpectedRequests);
  });
}
