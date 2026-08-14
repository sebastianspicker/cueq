import { WorkflowStatus, WorkflowType } from '@prisma/client';

async function seedDemoWorkflow(prisma, ids) {
  const data = {
    type: WorkflowType.LEAVE_REQUEST,
    status: WorkflowStatus.PENDING,
    requesterId: ids.personEmployee,
    approverId: ids.personLead,
    entityType: 'Absence',
    entityId: ids.absenceEmployeeRequested,
    reason: 'Demo leave approval pending',
    submittedAt: new Date('2026-03-18T08:30:00.000Z'),
    dueAt: new Date('2026-03-20T08:30:00.000Z'),
    escalationLevel: 0,
    delegationTrail: [ids.personLead],
    createdAt: new Date('2026-03-18T08:30:00.000Z'),
  };
  await prisma.workflowInstance.upsert({
    where: { id: ids.workflowPendingLeave },
    create: { id: ids.workflowPendingLeave, ...data },
    update: data,
  });
}

async function seedDemoTimeAccounts(prisma, ids, periodStart, periodEnd) {
  const securityTimeAccounts = [
    {
      id: ids.timeAccountPlanner,
      personId: ids.personPlanner,
      targetHours: 159.2,
      actualHours: 161.2,
      balance: 2,
      overtimeHours: 2,
    },
    {
      id: ids.timeAccountSecurity1,
      personId: ids.personSecurity1,
      targetHours: 159.2,
      actualHours: 160.4,
      balance: 1.2,
      overtimeHours: 1.2,
    },
    {
      id: ids.timeAccountSecurity2,
      personId: ids.personSecurity2,
      targetHours: 159.2,
      actualHours: 158.5,
      balance: -0.7,
      overtimeHours: 0,
    },
    {
      id: ids.timeAccountSecurity3,
      personId: ids.personSecurity3,
      targetHours: 159.2,
      actualHours: 162.9,
      balance: 3.7,
      overtimeHours: 3.7,
    },
    {
      id: ids.timeAccountSecurity4,
      personId: ids.personSecurity4,
      targetHours: 159.2,
      actualHours: 160.1,
      balance: 0.9,
      overtimeHours: 0.9,
    },
  ];
  for (const account of securityTimeAccounts) {
    await prisma.timeAccount.upsert({
      where: { personId_periodStart: { personId: account.personId, periodStart } },
      create: { ...account, periodStart, periodEnd },
      update: {
        targetHours: account.targetHours,
        actualHours: account.actualHours,
        balance: account.balance,
        overtimeHours: account.overtimeHours,
      },
    });
  }
}

async function seedDemoExportRun(prisma, ids) {
  const data = {
    closingPeriodId: ids.closingPeriod,
    format: 'CSV_V1',
    recordCount: 6,
    checksum: 'demo-csv-v1-2026-03-mock-university',
    artifact:
      'person_id,hours,overtime\nc000000000000000000000102,161.2,2\nc000000000000000000000106,160.4,1.2',
    contentType: 'text/csv',
    exportedAt: new Date('2026-03-31T16:05:00.000Z'),
    exportedById: ids.personHr,
  };
  await prisma.exportRun.upsert({
    where: { id: ids.exportRun },
    create: { id: ids.exportRun, ...data },
    update: data,
  });
}

async function seedDemoAuditEntries(prisma, ids) {
  const auditEntries = [
    {
      id: ids.auditReportAccessA,
      timestamp: '2026-03-20T09:00:00.000Z',
      action: 'REPORT_ACCESSED',
      entityId: 'team-absence:c000000000000000000000002:2026-03-01:2026-03-31',
      after: { report: 'team-absence', organizationUnitId: ids.ouSecurity, suppressed: false },
    },
    {
      id: ids.auditReportAccessB,
      timestamp: '2026-03-20T09:02:00.000Z',
      action: 'REPORT_ACCESSED',
      entityId: 'oe-overtime:c000000000000000000000002:2026-03-01:2026-03-31',
      after: { report: 'oe-overtime', organizationUnitId: ids.ouSecurity, suppressed: false },
    },
    {
      id: ids.auditClosingExported,
      timestamp: '2026-03-31T16:05:00.000Z',
      action: 'CLOSING_EXPORTED',
      entityId: ids.closingPeriod,
      after: { format: 'CSV_V1', checksum: 'demo-csv-v1-2026-03-mock-university' },
    },
    {
      id: ids.auditBackupRestore,
      timestamp: '2026-03-30T05:30:00.000Z',
      action: 'BACKUP_RESTORE_VERIFIED',
      entityId: 'backup-restore-demo-2026-03',
      after: { checksum: 'backup-restore-demo-checksum', status: 'VERIFIED' },
    },
    {
      id: ids.auditReportSuppressed,
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
      id: ids.auditDemoSeed,
      timestamp: '2026-03-01T08:00:00.000Z',
      action: 'DEMO_SEED_COMPLETED',
      entityId: 'mock-university-demo',
      after: { seeded: true, dataset: 'mock-university-nrw', screenshotReady: true },
    },
  ];
  await prisma.auditEntry.createMany({
    data: auditEntries.map((entry) => ({
      id: entry.id,
      timestamp: new Date(entry.timestamp),
      actorId: ids.personHr,
      action: entry.action,
      entityType: 'DemoRun',
      entityId: entry.entityId,
      after: entry.after,
      reason: 'Synthetic deterministic mock-university screenshot baseline',
      ipAddress: '127.0.0.1',
    })),
    skipDuplicates: true,
  });
}

export async function seedDemoClosing(prisma, ids, periodStart, periodEnd) {
  await seedDemoWorkflow(prisma, ids);
  await seedDemoTimeAccounts(prisma, ids, periodStart, periodEnd);
  await seedDemoExportRun(prisma, ids);
  await seedDemoAuditEntries(prisma, ids);
}
