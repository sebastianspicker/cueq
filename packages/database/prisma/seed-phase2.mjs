import {
  PrismaClient,
  Role,
  WorkTimeModelType,
  TimeTypeCategory,
  BookingSource,
  AbsenceType,
  AbsenceStatus,
  WorkflowType,
  WorkflowStatus,
  RosterStatus,
  ClosingStatus,
  OnCallRotationType,
} from '@prisma/client';

const prisma = new PrismaClient();

function cuidFor(index) {
  return `c${String(index).padStart(24, '0')}`;
}

const IDs = {
  ouAdmin: cuidFor(1),
  ouSecurity: cuidFor(2),
  ouIt: cuidFor(3),
  modelFlextime: cuidFor(10),
  modelShift: cuidFor(11),
  modelOncall: cuidFor(12),
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
  rosterCurrent: cuidFor(300),
  shiftNight: cuidFor(301),
  bookingEmployeeIn: cuidFor(400),
  bookingEmployeeOut: cuidFor(401),
  bookingOncallDeployment: cuidFor(402),
  absenceAnnual: cuidFor(500),
  absenceSick: cuidFor(501),
  workflowCorrection: cuidFor(600),
  workflowPolicyLeave: cuidFor(610),
  workflowPolicyCorrection: cuidFor(611),
  workflowPolicyPostClose: cuidFor(612),
  delegationLeadToHr: cuidFor(620),
  closingPeriod: cuidFor(700),
  exportRun: cuidFor(701),
  timeAccountEmployee: cuidFor(800),
  onCallDeployment: cuidFor(900),
  onCallRotation: cuidFor(901),
};

async function reset() {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.domainEventOutbox.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.workflowDelegationRule.deleteMany();
  await prisma.workflowPolicy.deleteMany();
  await prisma.terminalSyncBatch.deleteMany();
  await prisma.exportRun.deleteMany();
  await prisma.closingPeriod.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.onCallDeployment.deleteMany();
  await prisma.onCallRotation.deleteMany();
  await prisma.leaveAdjustment.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.roster.deleteMany();
  await prisma.timeAccount.deleteMany();
  await prisma.timeType.deleteMany();
  await prisma.person.deleteMany();
  await prisma.workTimeModel.deleteMany();
  await prisma.organizationUnit.deleteMany();
}

async function seed() {
  await prisma.organizationUnit.createMany({
    data: [
      { id: IDs.ouAdmin, name: 'Verwaltung' },
      { id: IDs.ouSecurity, name: 'Pforte', parentId: IDs.ouAdmin },
      { id: IDs.ouIt, name: 'IT Bereitschaft', parentId: IDs.ouAdmin },
    ],
  });

  await prisma.workTimeModel.createMany({
    data: [
      {
        id: IDs.modelFlextime,
        name: 'Gleitzeit Vollzeit',
        type: WorkTimeModelType.FLEXTIME,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        coreTimeStart: '09:00',
        coreTimeEnd: '15:00',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.modelShift,
        name: 'Pforte Nacht',
        type: WorkTimeModelType.SHIFT,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.modelOncall,
        name: 'IT Rufbereitschaft',
        type: WorkTimeModelType.FIXED,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });

  await prisma.person.createMany({
    data: [
      {
        id: IDs.personEmployee,
        externalId: 'employee01',
        firstName: 'Eva',
        lastName: 'Muster',
        email: 'employee@cueq.local',
        role: Role.EMPLOYEE,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personLead,
        externalId: 'lead01',
        firstName: 'Lea',
        lastName: 'Leitung',
        email: 'lead@cueq.local',
        role: Role.TEAM_LEAD,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personPlanner,
        externalId: 'planner01',
        firstName: 'Rita',
        lastName: 'Planer',
        email: 'planner@cueq.local',
        role: Role.SHIFT_PLANNER,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouSecurity,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelShift,
      },
      {
        id: IDs.personHr,
        externalId: 'hr01',
        firstName: 'Hanna',
        lastName: 'Personal',
        email: 'hr@cueq.local',
        role: Role.HR,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personAdmin,
        externalId: 'admin01',
        firstName: 'Alex',
        lastName: 'Admin',
        email: 'admin@cueq.local',
        role: Role.ADMIN,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personItOncall,
        externalId: 'oncall01',
        firstName: 'Iris',
        lastName: 'Bereitschaft',
        email: 'oncall@cueq.local',
        role: Role.EMPLOYEE,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouIt,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelOncall,
      },
      {
        id: IDs.personPayroll,
        externalId: 'payroll01',
        firstName: 'Paula',
        lastName: 'Payroll',
        email: 'payroll@cueq.local',
        role: Role.PAYROLL,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personDataProtection,
        externalId: 'dataprotection01',
        firstName: 'Dana',
        lastName: 'Datenschutz',
        email: 'dataprotection@cueq.local',
        role: Role.DATA_PROTECTION,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personWorksCouncil,
        externalId: 'workscouncil01',
        firstName: 'Walter',
        lastName: 'Personalrat',
        email: 'workscouncil@cueq.local',
        role: Role.WORKS_COUNCIL,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
    ],
  });

  await prisma.timeType.createMany({
    data: [
      {
        id: IDs.timeTypeWork,
        code: 'WORK',
        name: 'Arbeit',
        nameEn: 'Work',
        category: TimeTypeCategory.WORK,
      },
      {
        id: IDs.timeTypePause,
        code: 'PAUSE',
        name: 'Pause',
        nameEn: 'Break',
        category: TimeTypeCategory.PAUSE,
      },
      {
        id: IDs.timeTypeOnCall,
        code: 'ON_CALL',
        name: 'Rufbereitschaft',
        nameEn: 'On-call',
        category: TimeTypeCategory.ON_CALL,
      },
      {
        id: IDs.timeTypeDeployment,
        code: 'DEPLOYMENT',
        name: 'Einsatz',
        nameEn: 'Deployment',
        category: TimeTypeCategory.DEPLOYMENT,
      },
    ],
  });

  await prisma.roster.create({
    data: {
      id: IDs.rosterCurrent,
      organizationUnitId: IDs.ouSecurity,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      status: RosterStatus.PUBLISHED,
      publishedAt: new Date('2026-02-25T10:00:00.000Z'),
    },
  });

  await prisma.shift.create({
    data: {
      id: IDs.shiftNight,
      rosterId: IDs.rosterCurrent,
      personId: IDs.personPlanner,
      startTime: new Date('2026-03-08T22:00:00.000Z'),
      endTime: new Date('2026-03-09T06:00:00.000Z'),
      shiftType: 'NIGHT',
      minStaffing: 1,
    },
  });

  await prisma.shiftAssignment.create({
    data: {
      shiftId: IDs.shiftNight,
      personId: IDs.personPlanner,
    },
  });

  await prisma.booking.createMany({
    data: [
      {
        id: IDs.bookingEmployeeIn,
        personId: IDs.personEmployee,
        timeTypeId: IDs.timeTypeWork,
        startTime: new Date('2026-03-02T08:00:00.000Z'),
        endTime: new Date('2026-03-02T12:00:00.000Z'),
        source: BookingSource.WEB,
      },
      {
        id: IDs.bookingEmployeeOut,
        personId: IDs.personEmployee,
        timeTypeId: IDs.timeTypeWork,
        startTime: new Date('2026-03-02T13:00:00.000Z'),
        endTime: new Date('2026-03-02T17:00:00.000Z'),
        source: BookingSource.WEB,
      },
      {
        id: IDs.bookingOncallDeployment,
        personId: IDs.personItOncall,
        timeTypeId: IDs.timeTypeDeployment,
        startTime: new Date('2026-03-14T01:10:00.000Z'),
        endTime: new Date('2026-03-14T02:20:00.000Z'),
        source: BookingSource.MANUAL,
      },
    ],
  });

  await prisma.onCallRotation.create({
    data: {
      id: IDs.onCallRotation,
      personId: IDs.personItOncall,
      organizationUnitId: IDs.ouIt,
      startTime: new Date('2026-03-09T00:00:00.000Z'),
      endTime: new Date('2026-03-15T23:59:59.000Z'),
      rotationType: OnCallRotationType.WEEKLY,
      note: 'Synthetic rotation for deterministic tests',
    },
  });

  await prisma.onCallDeployment.create({
    data: {
      id: IDs.onCallDeployment,
      personId: IDs.personItOncall,
      rotationId: IDs.onCallRotation,
      startTime: new Date('2026-03-14T01:10:00.000Z'),
      endTime: new Date('2026-03-14T02:20:00.000Z'),
      remote: true,
      ticketReference: 'INC-2026-001',
      eventReference: 'EVT-2026-001',
      description: 'Synthetic deployment for acceptance tests',
    },
  });

  await prisma.absence.createMany({
    data: [
      {
        id: IDs.absenceAnnual,
        personId: IDs.personEmployee,
        type: AbsenceType.ANNUAL_LEAVE,
        startDate: new Date('2026-04-10T00:00:00.000Z'),
        endDate: new Date('2026-04-12T00:00:00.000Z'),
        days: 1.5,
        status: AbsenceStatus.APPROVED,
        note: 'Urlaub',
      },
      {
        id: IDs.absenceSick,
        personId: IDs.personPlanner,
        type: AbsenceType.SICK,
        startDate: new Date('2026-03-11T00:00:00.000Z'),
        endDate: new Date('2026-03-12T00:00:00.000Z'),
        days: 2,
        status: AbsenceStatus.APPROVED,
        note: 'Krank',
      },
    ],
  });

  await prisma.workflowPolicy.createMany({
    data: [
      {
        id: IDs.workflowPolicyLeave,
        type: WorkflowType.LEAVE_REQUEST,
        escalationDeadlineHours: 48,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.workflowPolicyCorrection,
        type: WorkflowType.BOOKING_CORRECTION,
        escalationDeadlineHours: 48,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.workflowPolicyPostClose,
        type: WorkflowType.POST_CLOSE_CORRECTION,
        escalationDeadlineHours: 24,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });

  await prisma.workflowDelegationRule.create({
    data: {
      id: IDs.delegationLeadToHr,
      delegatorId: IDs.personLead,
      delegateId: IDs.personHr,
      workflowType: WorkflowType.BOOKING_CORRECTION,
      organizationUnitId: IDs.ouAdmin,
      activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
      priority: 1,
      createdById: IDs.personAdmin,
    },
  });

  await prisma.workflowInstance.create({
    data: {
      id: IDs.workflowCorrection,
      type: WorkflowType.BOOKING_CORRECTION,
      status: WorkflowStatus.PENDING,
      requesterId: IDs.personEmployee,
      approverId: IDs.personLead,
      entityType: 'Booking',
      entityId: IDs.bookingEmployeeIn,
      reason: 'Bitte Startzeit korrigieren',
      submittedAt: new Date('2026-03-03T09:00:00.000Z'),
      dueAt: new Date('2026-03-05T09:00:00.000Z'),
      escalationLevel: 0,
      delegationTrail: ['c000000000000000000000101'],
      createdAt: new Date('2026-03-03T09:00:00.000Z'),
    },
  });

  await prisma.timeAccount.create({
    data: {
      id: IDs.timeAccountEmployee,
      personId: IDs.personEmployee,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      targetHours: 159.2,
      actualHours: 160.1,
      balance: 0.9,
      overtimeHours: 0.9,
    },
  });

  await prisma.closingPeriod.create({
    data: {
      id: IDs.closingPeriod,
      organizationUnitId: IDs.ouAdmin,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      status: ClosingStatus.REVIEW,
    },
  });

  await prisma.auditEntry.create({
    data: {
      timestamp: new Date('2026-03-15T12:00:00.000Z'),
      actorId: IDs.personAdmin,
      action: 'PHASE2_SEED_COMPLETED',
      entityType: 'SeedRun',
      entityId: 'phase2-default',
      after: { seeded: true, seededAt: '2026-03-15T12:00:00.000Z' },
      reason: 'Synthetic deterministic acceptance baseline',
      ipAddress: '127.0.0.1',
    },
  });
}

async function main() {
  const command = process.argv[2] ?? 'seed';

  if (command === 'reset') {
    await reset();
    return;
  }

  if (command === 'seed') {
    await reset();
    await seed();
    return;
  }

  throw new Error(`Unsupported command: ${command}. Use "seed" or "reset".`);
}

main()
  .catch((error) => {
    console.error('Phase 2 seed script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
