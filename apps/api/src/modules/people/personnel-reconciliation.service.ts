import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Atomic generic HR reconciliation; source revisions never imply field ownership. */
import { reconciliationHash } from './reconciliation-hash.js';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { CreateHrSourceSchema, ReconcilePersonnelSchema, type HrCapability } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import {
  lockPersonWrites,
  lockHrSourceWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { CapabilityHelper } from './capability.helper.js';
import { assertPersonnelScope } from './personnel-scope.js';

@Injectable()
export class PersonnelReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async assertGlobal(
    actorId: string,
    tx: Pick<Prisma.TransactionClient, 'capabilityGrant'> = this.prisma,
    capability: HrCapability = 'hr.reconcile',
  ) {
    await this.capabilities.assert(actorId, capability, {}, tx);
  }

  async createSource(actorId: string, payload: unknown) {
    const input = parseRequest(CreateHrSourceSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobal(actorId, tx);
      const source = await tx.hrSourceSystem.create({ data: input });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'HR_SOURCE_REGISTERED',
          entityType: 'HrSourceSystem',
          entityId: source.id,
          after: { code: source.code },
        },
        tx,
      );
      return source;
    });
  }

  async reconcile(actorId: string, sourceSystemId: string, payload: unknown) {
    const input = parseRequest(ReconcilePersonnelSchema, payload);
    if (
      new Set(input.records.map((r) => r.personId)).size !== input.records.length ||
      new Set(input.records.map((r) => r.externalRecordId)).size !== input.records.length
    ) {
      throw new ConflictException('Each person and external record may occur only once per batch.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertGlobal(actorId, tx);
        await lockHrSourceWrites(tx, sourceSystemId);
        const source = await tx.hrSourceSystem.findUnique({ where: { id: sourceSystemId } });
        if (!source) throw new NotFoundException('Source system not found.');
        const ownership = CreateHrSourceSchema.shape.ownershipProfile.parse(
          source.ownershipProfile,
        );
        await lockPersonWrites(
          tx,
          input.records.map((r) => r.personId),
        );
        const results: Array<{
          personId: string;
          status: 'APPLIED' | 'UNCHANGED';
          appliedFields: number;
          ignoredFields: number;
        }> = [];
        for (const record of input.records) {
          results.push(await reconcileRecord(tx, actorId, sourceSystemId, ownership, record));
        }
        await this.audit.appendAudit(
          {
            actorId,
            action: 'PERSONNEL_RECONCILED',
            entityType: 'HrSourceSystem',
            entityId: sourceSystemId,
            after: {
              records: input.records.length,
              appliedFields: results.reduce((sum, r) => sum + r.appliedFields, 0),
            },
          },
          tx,
        );
        return { items: results };
      },
      { timeout: 30_000 },
    );
  }
}

type ReconciliationRecord = ReturnType<typeof ReconcilePersonnelSchema.parse>['records'][number];
type OwnershipProfile = ReturnType<typeof CreateHrSourceSchema.parse>['ownershipProfile'];
async function reconcileRecord(
  tx: Prisma.TransactionClient,
  actorId: string,
  sourceSystemId: string,
  ownership: OwnershipProfile,
  record: ReconciliationRecord,
) {
  await assertPersonnelScope(tx, actorId, 'hr.reconcile', record.personId);
  const existing = await tx.externalHrRecord.findUnique({
    where: {
      sourceSystemId_externalRecordId: {
        sourceSystemId,
        externalRecordId: record.externalRecordId,
      },
    },
  });
  if (!existing) {
    const bound = await tx.externalHrRecord.findUnique({
      where: { sourceSystemId_personId: { sourceSystemId, personId: record.personId } },
    });
    if (bound) throw new ConflictException('Person already has a different record in this source.');
  }
  const hash = reconciliationHash(record.fields);
  if (existing && existing.personId !== record.personId)
    throw new ConflictException('External record identity conflict.');
  if (existing?.revision === record.revision) {
    if (existing.payloadHash !== hash)
      throw new ConflictException('A source revision cannot describe different content.');
    return {
      personId: record.personId,
      status: 'UNCHANGED' as const,
      appliedFields: 0,
      ignoredFields: 0,
    };
  }
  if ((existing?.revision ?? null) !== record.expectedSourceRevision)
    throw new ConflictException('Source revision conflict. Reload before reconciling.');
  let appliedFields = 0;
  let ignoredFields = 0;
  for (const [key, value] of Object.entries(record.fields)) {
    if (value === undefined) continue;
    const field = await tx.personnelField.findUnique({
      where: { personId_key: { personId: record.personId, key } },
    });
    if (
      !sourceOwnsField(
        ownership[key as keyof typeof ownership],
        field?.ownerSystemId,
        sourceSystemId,
      )
    ) {
      ignoredFields += 1;
      continue;
    }
    await applySourceField(tx, sourceSystemId, record, key, value);
    appliedFields += 1;
  }
  await tx.externalHrRecord.upsert({
    where: {
      sourceSystemId_externalRecordId: {
        sourceSystemId,
        externalRecordId: record.externalRecordId,
      },
    },
    create: {
      sourceSystemId,
      externalRecordId: record.externalRecordId,
      personId: record.personId,
      revision: record.revision,
      payloadHash: hash,
    },
    update: { revision: record.revision, payloadHash: hash },
  });
  return { personId: record.personId, status: 'APPLIED' as const, appliedFields, ignoredFields };
}
async function applySourceField(
  tx: Prisma.TransactionClient,
  sourceSystemId: string,
  record: ReconciliationRecord,
  key: string,
  value: string,
) {
  await tx.personnelField.upsert({
    where: { personId_key: { personId: record.personId, key } },
    create: {
      personId: record.personId,
      key,
      value,
      ownerSystemId: sourceSystemId,
      sourceRevision: record.revision,
    },
    update: { value, sourceRevision: record.revision, revision: { increment: 1 } },
  });
  if (key === 'firstName' || key === 'lastName')
    await tx.person.update({ where: { id: record.personId }, data: { [key]: value } });
  // One active request per person/field is serialized by the shared person lock.
  const pending = await tx.profileChangeRequest.findFirst({
    where: {
      personId: record.personId,
      fieldKey: key,
      ownerSystemId: sourceSystemId,
      status: 'PENDING_SYNC',
    },
  });
  if (pending) {
    const status = pending.requestedValue === value ? 'APPLIED' : 'CONFLICT';
    await tx.profileChangeRequest.update({
      where: { id: pending.id },
      data: { status, resolvedAt: new Date() },
    });
    await tx.personnelChangeOutbox.update({
      where: { requestId: pending.id },
      data: { status, acknowledgedAt: new Date(), acknowledgedRevision: record.revision },
    });
  }
}

function sourceOwnsField(
  ownership: string | undefined,
  fieldOwner: string | null | undefined,
  sourceSystemId: string,
) {
  return ownership === 'SOURCE' && (fieldOwner === undefined || fieldOwner === sourceSystemId);
}
