import { stableCuid } from '../seed-helpers.mjs';

function cuidFor(index) {
  return stableCuid(index);
}

export const IDs = {
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

export const MARCH_PERIOD_START = new Date('2026-03-01T00:00:00.000Z');
export const MARCH_PERIOD_END = new Date('2026-03-31T23:59:59.000Z');
