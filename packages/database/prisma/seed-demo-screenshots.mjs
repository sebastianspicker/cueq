import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AbsenceStatus,
  AbsenceType,
  BookingSource,
  PrismaClient,
  Role,
  WorkflowStatus,
  WorkflowType,
} from '@prisma/client';

const DEFAULT_DATABASE_URL =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  personSecurity1: cuidFor(106),
  personSecurity2: cuidFor(107),
  personSecurity3: cuidFor(108),
  personSecurity4: cuidFor(109),
  personSecurityPlanner: cuidFor(110),
  timeTypeWork: cuidFor(200),
  rosterCurrent: cuidFor(300),
  shiftNight: cuidFor(301),
  shiftMorning: cuidFor(302),
  shiftLate: cuidFor(303),
  bookingSecurityNightPlanner: cuidFor(403),
  bookingSecurityNightGuard: cuidFor(404),
  bookingSecurityMorning: cuidFor(405),
  bookingSecurityLateA: cuidFor(406),
  bookingSecurityLateB: cuidFor(407),
  absenceEmployeeRequested: cuidFor(510),
  absenceEmployeeRejected: cuidFor(511),
  absenceSecurityApproved: cuidFor(512),
  absenceSecurityCancelled: cuidFor(513),
  workflowPendingLeave: cuidFor(601),
  closingPeriod: cuidFor(700),
  exportRun: cuidFor(701),
  timeAccountPlanner: cuidFor(801),
  timeAccountSecurity1: cuidFor(802),
  timeAccountSecurity2: cuidFor(803),
  timeAccountSecurity3: cuidFor(804),
  timeAccountSecurity4: cuidFor(805),
  auditReportAccessA: cuidFor(960),
  auditReportAccessB: cuidFor(961),
  auditClosingExported: cuidFor(962),
  auditBackupRestore: cuidFor(963),
  auditReportSuppressed: cuidFor(964),
  auditDemoSeed: cuidFor(965),
};

const MARCH_PERIOD_START = new Date('2026-03-01T00:00:00.000Z');
const MARCH_PERIOD_END = new Date('2026-03-31T23:59:59.000Z');

function runPhase3(command) {
  execSync(`node ${resolve(__dirname, 'seed-phase3.mjs')} ${command}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });
}

async function upsertPerson(data) {
  await prisma.person.upsert({
    where: { id: data.id },
    create: data,
    update: {
      externalId: data.externalId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      employmentStartDate: data.employmentStartDate,
      organizationUnitId: data.organizationUnitId,
      supervisorId: data.supervisorId ?? null,
      workTimeModelId: data.workTimeModelId,
    },
  });
}

async function seed() {
  runPhase3('seed');

  await prisma.organizationUnit.update({
    where: { id: IDs.ouAdmin },
    data: { name: 'Mock University NRW - Administration' },
  });
  await prisma.organizationUnit.update({
    where: { id: IDs.ouSecurity },
    data: { name: 'Mock University NRW - Security Desk' },
  });
  await prisma.organizationUnit.update({
    where: { id: IDs.ouIt },
    data: { name: 'Mock University NRW - IT On-Call' },
  });

  await prisma.workTimeModel.update({
    where: { id: IDs.modelFlextime },
    data: { name: 'Mock University NRW - Flextime Full-time' },
  });
  await prisma.workTimeModel.update({
    where: { id: IDs.modelShift },
    data: { name: 'Mock University NRW - Security Shift' },
  });
  await prisma.workTimeModel.update({
    where: { id: IDs.modelOncall },
    data: { name: 'Mock University NRW - IT On-Call Model' },
  });

  await prisma.person.update({
    where: { id: IDs.personEmployee },
    data: { firstName: 'Mila', lastName: 'Demofall' },
  });
  await prisma.person.update({
    where: { id: IDs.personLead },
    data: { firstName: 'Lena', lastName: 'Leitung' },
  });
  await prisma.person.update({
    where: { id: IDs.personPlanner },
    data: { firstName: 'Pia', lastName: 'Planung' },
  });
  await prisma.person.update({
    where: { id: IDs.personHr },
    data: { firstName: 'Hedi', lastName: 'Personal' },
  });
  await prisma.person.update({
    where: { id: IDs.personAdmin },
    data: { firstName: 'Aron', lastName: 'Administration' },
  });
  await prisma.person.update({
    where: { id: IDs.personItOncall },
    data: { firstName: 'Ida', lastName: 'Bereitschaft' },
  });

  const securityEmploymentStart = new Date('2025-01-01T00:00:00.000Z');
  await upsertPerson({
    id: IDs.personSecurity1,
    externalId: 'security01',
    firstName: 'Nora',
    lastName: 'Nachtwache',
    email: 'security01@cueq.local',
    role: Role.EMPLOYEE,
    employmentStartDate: securityEmploymentStart,
    organizationUnitId: IDs.ouSecurity,
    supervisorId: IDs.personLead,
    workTimeModelId: IDs.modelShift,
  });
  await upsertPerson({
    id: IDs.personSecurity2,
    externalId: 'security02',
    firstName: 'Felix',
    lastName: 'Fruehschicht',
    email: 'security02@cueq.local',
    role: Role.EMPLOYEE,
    employmentStartDate: securityEmploymentStart,
    organizationUnitId: IDs.ouSecurity,
    supervisorId: IDs.personLead,
    workTimeModelId: IDs.modelShift,
  });
  await upsertPerson({
    id: IDs.personSecurity3,
    externalId: 'security03',
    firstName: 'Greta',
    lastName: 'Guard',
    email: 'security03@cueq.local',
    role: Role.EMPLOYEE,
    employmentStartDate: securityEmploymentStart,
    organizationUnitId: IDs.ouSecurity,
    supervisorId: IDs.personLead,
    workTimeModelId: IDs.modelShift,
  });
  await upsertPerson({
    id: IDs.personSecurity4,
    externalId: 'security04',
    firstName: 'Timo',
    lastName: 'Torwache',
    email: 'security04@cueq.local',
    role: Role.EMPLOYEE,
    employmentStartDate: securityEmploymentStart,
    organizationUnitId: IDs.ouSecurity,
    supervisorId: IDs.personLead,
    workTimeModelId: IDs.modelShift,
  });
  await upsertPerson({
    id: IDs.personSecurityPlanner,
    externalId: 'securityplanner01',
    firstName: 'Rana',
    lastName: 'Dienstplan',
    email: 'security-planner@cueq.local',
    role: Role.SHIFT_PLANNER,
    employmentStartDate: securityEmploymentStart,
    organizationUnitId: IDs.ouSecurity,
    supervisorId: IDs.personLead,
    workTimeModelId: IDs.modelShift,
  });

  await prisma.shift.update({
    where: { id: IDs.shiftNight },
    data: {
      personId: IDs.personPlanner,
      minStaffing: 2,
      shiftType: 'NIGHT',
      startTime: new Date('2026-03-08T22:00:00.000Z'),
      endTime: new Date('2026-03-09T06:00:00.000Z'),
    },
  });

  await prisma.shift.upsert({
    where: { id: IDs.shiftMorning },
    create: {
      id: IDs.shiftMorning,
      rosterId: IDs.rosterCurrent,
      personId: IDs.personSecurity2,
      shiftType: 'EARLY',
      minStaffing: 1,
      startTime: new Date('2026-03-10T06:00:00.000Z'),
      endTime: new Date('2026-03-10T14:00:00.000Z'),
    },
    update: {
      personId: IDs.personSecurity2,
      shiftType: 'EARLY',
      minStaffing: 1,
      startTime: new Date('2026-03-10T06:00:00.000Z'),
      endTime: new Date('2026-03-10T14:00:00.000Z'),
    },
  });

  await prisma.shift.upsert({
    where: { id: IDs.shiftLate },
    create: {
      id: IDs.shiftLate,
      rosterId: IDs.rosterCurrent,
      personId: IDs.personSecurity3,
      shiftType: 'LATE',
      minStaffing: 2,
      startTime: new Date('2026-03-10T14:00:00.000Z'),
      endTime: new Date('2026-03-10T22:00:00.000Z'),
    },
    update: {
      personId: IDs.personSecurity3,
      shiftType: 'LATE',
      minStaffing: 2,
      startTime: new Date('2026-03-10T14:00:00.000Z'),
      endTime: new Date('2026-03-10T22:00:00.000Z'),
    },
  });

  const assignments = [
    { shiftId: IDs.shiftNight, personId: IDs.personPlanner },
    { shiftId: IDs.shiftNight, personId: IDs.personSecurity1 },
    { shiftId: IDs.shiftMorning, personId: IDs.personSecurity2 },
    { shiftId: IDs.shiftLate, personId: IDs.personSecurity3 },
    { shiftId: IDs.shiftLate, personId: IDs.personSecurity4 },
  ];
  for (const assignment of assignments) {
    await prisma.shiftAssignment.upsert({
      where: {
        shiftId_personId: {
          shiftId: assignment.shiftId,
          personId: assignment.personId,
        },
      },
      create: assignment,
      update: {},
    });
  }

  const securityBookings = [
    {
      id: IDs.bookingSecurityNightPlanner,
      personId: IDs.personPlanner,
      shiftId: IDs.shiftNight,
      startTime: '2026-03-08T22:00:00.000Z',
      endTime: '2026-03-09T06:00:00.000Z',
    },
    {
      id: IDs.bookingSecurityNightGuard,
      personId: IDs.personSecurity1,
      shiftId: IDs.shiftNight,
      startTime: '2026-03-08T22:15:00.000Z',
      endTime: '2026-03-09T05:55:00.000Z',
    },
    {
      id: IDs.bookingSecurityMorning,
      personId: IDs.personSecurity2,
      shiftId: IDs.shiftMorning,
      startTime: '2026-03-10T06:00:00.000Z',
      endTime: '2026-03-10T14:00:00.000Z',
    },
    {
      id: IDs.bookingSecurityLateA,
      personId: IDs.personSecurity3,
      shiftId: IDs.shiftLate,
      startTime: '2026-03-10T14:00:00.000Z',
      endTime: '2026-03-10T22:00:00.000Z',
    },
    {
      id: IDs.bookingSecurityLateB,
      personId: IDs.personSecurity4,
      shiftId: IDs.shiftLate,
      startTime: '2026-03-10T14:05:00.000Z',
      endTime: '2026-03-10T21:50:00.000Z',
    },
  ];
  for (const booking of securityBookings) {
    await prisma.booking.upsert({
      where: { id: booking.id },
      create: {
        id: booking.id,
        personId: booking.personId,
        timeTypeId: IDs.timeTypeWork,
        shiftId: booking.shiftId,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        source: BookingSource.WEB,
      },
      update: {
        personId: booking.personId,
        timeTypeId: IDs.timeTypeWork,
        shiftId: booking.shiftId,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        source: BookingSource.WEB,
      },
    });
  }

  const absences = [
    {
      id: IDs.absenceEmployeeRequested,
      personId: IDs.personEmployee,
      type: AbsenceType.SPECIAL_LEAVE,
      startDate: '2026-03-18T00:00:00.000Z',
      endDate: '2026-03-19T00:00:00.000Z',
      days: 2,
      status: AbsenceStatus.REQUESTED,
      note: 'Demo request for committee participation',
    },
    {
      id: IDs.absenceEmployeeRejected,
      personId: IDs.personEmployee,
      type: AbsenceType.TRAINING,
      startDate: '2026-03-24T00:00:00.000Z',
      endDate: '2026-03-24T00:00:00.000Z',
      days: 1,
      status: AbsenceStatus.REJECTED,
      note: 'Demo rejected training request',
    },
    {
      id: IDs.absenceSecurityApproved,
      personId: IDs.personSecurity1,
      type: AbsenceType.ANNUAL_LEAVE,
      startDate: '2026-03-05T00:00:00.000Z',
      endDate: '2026-03-06T00:00:00.000Z',
      days: 2,
      status: AbsenceStatus.APPROVED,
      note: 'Demo approved leave',
    },
    {
      id: IDs.absenceSecurityCancelled,
      personId: IDs.personSecurity2,
      type: AbsenceType.TRAINING,
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-03-20T00:00:00.000Z',
      days: 1,
      status: AbsenceStatus.CANCELLED,
      note: 'Demo cancelled absence',
    },
  ];
  for (const absence of absences) {
    await prisma.absence.upsert({
      where: { id: absence.id },
      create: {
        id: absence.id,
        personId: absence.personId,
        type: absence.type,
        startDate: new Date(absence.startDate),
        endDate: new Date(absence.endDate),
        days: absence.days,
        status: absence.status,
        note: absence.note,
      },
      update: {
        personId: absence.personId,
        type: absence.type,
        startDate: new Date(absence.startDate),
        endDate: new Date(absence.endDate),
        days: absence.days,
        status: absence.status,
        note: absence.note,
      },
    });
  }

  await prisma.workflowInstance.upsert({
    where: { id: IDs.workflowPendingLeave },
    create: {
      id: IDs.workflowPendingLeave,
      type: WorkflowType.LEAVE_REQUEST,
      status: WorkflowStatus.PENDING,
      requesterId: IDs.personEmployee,
      approverId: IDs.personLead,
      entityType: 'Absence',
      entityId: IDs.absenceEmployeeRequested,
      reason: 'Demo leave approval pending',
      submittedAt: new Date('2026-03-18T08:30:00.000Z'),
      dueAt: new Date('2026-03-20T08:30:00.000Z'),
      escalationLevel: 0,
      delegationTrail: [IDs.personLead],
      createdAt: new Date('2026-03-18T08:30:00.000Z'),
    },
    update: {
      type: WorkflowType.LEAVE_REQUEST,
      status: WorkflowStatus.PENDING,
      requesterId: IDs.personEmployee,
      approverId: IDs.personLead,
      entityType: 'Absence',
      entityId: IDs.absenceEmployeeRequested,
      reason: 'Demo leave approval pending',
      submittedAt: new Date('2026-03-18T08:30:00.000Z'),
      dueAt: new Date('2026-03-20T08:30:00.000Z'),
      escalationLevel: 0,
      delegationTrail: [IDs.personLead],
      createdAt: new Date('2026-03-18T08:30:00.000Z'),
    },
  });

  const securityTimeAccounts = [
    {
      id: IDs.timeAccountPlanner,
      personId: IDs.personPlanner,
      targetHours: 159.2,
      actualHours: 161.2,
      balance: 2,
      overtimeHours: 2,
    },
    {
      id: IDs.timeAccountSecurity1,
      personId: IDs.personSecurity1,
      targetHours: 159.2,
      actualHours: 160.4,
      balance: 1.2,
      overtimeHours: 1.2,
    },
    {
      id: IDs.timeAccountSecurity2,
      personId: IDs.personSecurity2,
      targetHours: 159.2,
      actualHours: 158.5,
      balance: -0.7,
      overtimeHours: 0,
    },
    {
      id: IDs.timeAccountSecurity3,
      personId: IDs.personSecurity3,
      targetHours: 159.2,
      actualHours: 162.9,
      balance: 3.7,
      overtimeHours: 3.7,
    },
    {
      id: IDs.timeAccountSecurity4,
      personId: IDs.personSecurity4,
      targetHours: 159.2,
      actualHours: 160.1,
      balance: 0.9,
      overtimeHours: 0.9,
    },
  ];
  for (const account of securityTimeAccounts) {
    await prisma.timeAccount.upsert({
      where: {
        personId_periodStart: {
          personId: account.personId,
          periodStart: MARCH_PERIOD_START,
        },
      },
      create: {
        id: account.id,
        personId: account.personId,
        periodStart: MARCH_PERIOD_START,
        periodEnd: MARCH_PERIOD_END,
        targetHours: account.targetHours,
        actualHours: account.actualHours,
        balance: account.balance,
        overtimeHours: account.overtimeHours,
      },
      update: {
        targetHours: account.targetHours,
        actualHours: account.actualHours,
        balance: account.balance,
        overtimeHours: account.overtimeHours,
      },
    });
  }

  await prisma.exportRun.upsert({
    where: { id: IDs.exportRun },
    create: {
      id: IDs.exportRun,
      closingPeriodId: IDs.closingPeriod,
      format: 'CSV_V1',
      recordCount: 6,
      checksum: 'demo-csv-v1-2026-03-mock-university',
      artifact:
        'person_id,hours,overtime\nc000000000000000000000102,161.2,2\nc000000000000000000000106,160.4,1.2',
      contentType: 'text/csv',
      exportedAt: new Date('2026-03-31T16:05:00.000Z'),
      exportedById: IDs.personHr,
    },
    update: {
      closingPeriodId: IDs.closingPeriod,
      format: 'CSV_V1',
      recordCount: 6,
      checksum: 'demo-csv-v1-2026-03-mock-university',
      artifact:
        'person_id,hours,overtime\nc000000000000000000000102,161.2,2\nc000000000000000000000106,160.4,1.2',
      contentType: 'text/csv',
      exportedAt: new Date('2026-03-31T16:05:00.000Z'),
      exportedById: IDs.personHr,
    },
  });

  const auditEntries = [
    {
      id: IDs.auditReportAccessA,
      timestamp: '2026-03-20T09:00:00.000Z',
      action: 'REPORT_ACCESSED',
      entityId: 'team-absence:c000000000000000000000002:2026-03-01:2026-03-31',
      after: {
        report: 'team-absence',
        organizationUnitId: IDs.ouSecurity,
        suppressed: false,
      },
    },
    {
      id: IDs.auditReportAccessB,
      timestamp: '2026-03-20T09:02:00.000Z',
      action: 'REPORT_ACCESSED',
      entityId: 'oe-overtime:c000000000000000000000002:2026-03-01:2026-03-31',
      after: {
        report: 'oe-overtime',
        organizationUnitId: IDs.ouSecurity,
        suppressed: false,
      },
    },
    {
      id: IDs.auditClosingExported,
      timestamp: '2026-03-31T16:05:00.000Z',
      action: 'CLOSING_EXPORTED',
      entityId: IDs.closingPeriod,
      after: {
        format: 'CSV_V1',
        checksum: 'demo-csv-v1-2026-03-mock-university',
      },
    },
    {
      id: IDs.auditBackupRestore,
      timestamp: '2026-03-30T05:30:00.000Z',
      action: 'BACKUP_RESTORE_VERIFIED',
      entityId: 'backup-restore-demo-2026-03',
      after: {
        checksum: 'backup-restore-demo-checksum',
        status: 'VERIFIED',
      },
    },
    {
      id: IDs.auditReportSuppressed,
      timestamp: '2026-03-20T09:05:00.000Z',
      action: 'REPORT_ACCESSED',
      entityId: 'team-absence:suppressed-demo:2026-03-01:2026-03-31',
      after: {
        report: 'team-absence',
        organizationUnitId: 'c000000000000000000000999',
        suppressed: true,
      },
    },
    {
      id: IDs.auditDemoSeed,
      timestamp: '2026-03-01T08:00:00.000Z',
      action: 'DEMO_SEED_COMPLETED',
      entityId: 'mock-university-demo',
      after: {
        seeded: true,
        dataset: 'mock-university-nrw',
        screenshotReady: true,
      },
    },
  ];
  for (const entry of auditEntries) {
    await prisma.auditEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        timestamp: new Date(entry.timestamp),
        actorId: IDs.personHr,
        action: entry.action,
        entityType: 'DemoRun',
        entityId: entry.entityId,
        after: entry.after,
        reason: 'Synthetic deterministic mock-university screenshot baseline',
        ipAddress: '127.0.0.1',
      },
      update: {
        timestamp: new Date(entry.timestamp),
        actorId: IDs.personHr,
        action: entry.action,
        entityType: 'DemoRun',
        entityId: entry.entityId,
        after: entry.after,
        reason: 'Synthetic deterministic mock-university screenshot baseline',
        ipAddress: '127.0.0.1',
      },
    });
  }
}

async function reset() {
  runPhase3('reset');
}

async function main() {
  const command = process.argv[2] ?? 'seed';

  if (command === 'reset') {
    await reset();
    return;
  }

  if (command === 'seed') {
    await seed();
    return;
  }

  throw new Error(`Unsupported command: ${command}. Use "seed" or "reset".`);
}

main()
  .catch((error) => {
    console.error('Demo screenshot seed script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
