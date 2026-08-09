/** Removes dependent Phase 2 seed data in foreign-key-safe order; this is destructive for the connected database. */
export async function resetPhase2(prisma) {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.domainEventOutbox.deleteMany();
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
