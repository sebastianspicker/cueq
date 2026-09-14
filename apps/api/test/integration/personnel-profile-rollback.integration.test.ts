import { PrismaClient, type Prisma } from '@cueq/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AuditHelper } from '../../src/modules/audit/public.js';
import { ProfileChangesService } from '../../src/modules/people/profile-changes.service.js';
import type { PrismaService } from '../../src/persistence/prisma.service.js';

const EMPLOYEE_ID = 'c000000000000000000000100';
const HR_ID = 'c000000000000000000000103';
const FIELD_KEY = 'emergencyContact';

const prisma = new PrismaClient();
beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

it('rolls back a native profile approval, field update, grant, and audit together', async () => {
  const rollback = new Error('ROLLBACK_SYNTHETIC_PERSONNEL');
  const beforeField = await prisma.personnelField.findUnique({
    where: { personId_key: { personId: EMPLOYEE_ID, key: FIELD_KEY } },
  });
  let requestId = '';

  await expect(
    prisma.$transaction(
      async (tx) => {
        await tx.capabilityGrant.create({
          data: {
            granteeId: HR_ID,
            capability: 'profile.approve',
            scope: 'GLOBAL',
            targetId: null,
            activeFrom: new Date(Date.now() - 60_000),
            grantedById: HR_ID,
            reason: 'Synthetic rollback fixture',
          },
        });
        const field = await tx.personnelField.upsert({
          where: { personId_key: { personId: EMPLOYEE_ID, key: FIELD_KEY } },
          create: {
            personId: EMPLOYEE_ID,
            key: FIELD_KEY,
            value: 'Before rollback fixture',
          },
          update: {
            value: 'Before rollback fixture',
            ownerSystemId: null,
            revision: { increment: 1 },
          },
        });
        const request = await tx.profileChangeRequest.create({
          data: {
            personId: EMPLOYEE_ID,
            fieldKey: FIELD_KEY,
            requestedValue: 'After rollback fixture',
            expectedRevision: field.revision,
            ownerSystemId: null,
          },
        });
        requestId = request.id;

        const transactionPrisma = {
          $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) =>
            callback(tx),
        } as unknown as PrismaService;
        const service = new ProfileChangesService(
          transactionPrisma,
          new AuditHelper(tx as unknown as PrismaService),
        );
        await service.review(HR_ID, request.id, {
          decision: 'APPROVE',
          reason: 'Synthetic native approval',
        });

        await expect(
          tx.profileChangeRequest.findUniqueOrThrow({ where: { id: request.id } }),
        ).resolves.toMatchObject({ status: 'APPLIED', reviewerId: HR_ID });
        await expect(
          tx.personnelField.findUniqueOrThrow({
            where: { personId_key: { personId: EMPLOYEE_ID, key: FIELD_KEY } },
          }),
        ).resolves.toMatchObject({ value: 'After rollback fixture' });
        expect(
          await tx.auditEntry.count({
            where: { entityType: 'ProfileChangeRequest', entityId: request.id },
          }),
        ).toBe(1);
        throw rollback;
      },
      { timeout: 20_000 },
    ),
  ).rejects.toBe(rollback);

  expect(requestId).not.toBe('');
  await expect(prisma.profileChangeRequest.findUnique({ where: { id: requestId } })).resolves.toBe(
    null,
  );
  const afterField = await prisma.personnelField.findUnique({
    where: { personId_key: { personId: EMPLOYEE_ID, key: FIELD_KEY } },
  });
  expect(afterField).toEqual(beforeField);
  expect(
    await prisma.auditEntry.count({
      where: { entityType: 'ProfileChangeRequest', entityId: requestId },
    }),
  ).toBe(0);
});
