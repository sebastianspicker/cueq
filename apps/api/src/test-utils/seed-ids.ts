export function cuidFor(index: number): string {
  return `c${String(index).padStart(24, '0')}`;
}

export const SEED_IDS = {
  ouAdmin: cuidFor(1),
  ouSecurity: cuidFor(2),
  ouIt: cuidFor(3),
  personEmployee: cuidFor(100),
  personLead: cuidFor(101),
  personPlanner: cuidFor(102),
  personHr: cuidFor(103),
  personAdmin: cuidFor(104),
  personItOncall: cuidFor(105),
  personPayroll: cuidFor(106),
  personDataProtection: cuidFor(107),
  personWorksCouncil: cuidFor(108),
  timeTypeWork: cuidFor(200),
  timeTypePause: cuidFor(201),
  timeTypeOnCall: cuidFor(202),
  timeTypeDeployment: cuidFor(203),
  bookingEmployeeIn: cuidFor(400),
  bookingEmployeeOut: cuidFor(401),
  bookingOncallDeployment: cuidFor(402),
  rosterCurrent: cuidFor(300),
  shiftNight: cuidFor(301),
  onCallRotation: cuidFor(901),
  closingPeriod: cuidFor(700),
};

export const MOCK_IDENTITIES = {
  employee: {
    sub: SEED_IDS.personEmployee,
    email: 'employee@cueq.local',
    role: 'EMPLOYEE',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  lead: {
    sub: SEED_IDS.personLead,
    email: 'lead@cueq.local',
    role: 'TEAM_LEAD',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  planner: {
    sub: SEED_IDS.personPlanner,
    email: 'planner@cueq.local',
    role: 'SHIFT_PLANNER',
    organizationUnitId: SEED_IDS.ouSecurity,
  },
  hr: {
    sub: SEED_IDS.personHr,
    email: 'hr@cueq.local',
    role: 'HR',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  admin: {
    sub: SEED_IDS.personAdmin,
    email: 'admin@cueq.local',
    role: 'ADMIN',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  payroll: {
    sub: SEED_IDS.personPayroll,
    email: 'payroll@cueq.local',
    role: 'PAYROLL',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  dataProtection: {
    sub: SEED_IDS.personDataProtection,
    email: 'dataprotection@cueq.local',
    role: 'DATA_PROTECTION',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
  worksCouncil: {
    sub: SEED_IDS.personWorksCouncil,
    email: 'workscouncil@cueq.local',
    role: 'WORKS_COUNCIL',
    organizationUnitId: SEED_IDS.ouAdmin,
  },
};

export function buildMockToken(payload: Record<string, unknown>): string {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}
