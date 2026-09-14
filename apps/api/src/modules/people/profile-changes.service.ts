import { profileReviewStatus } from './profile-review-status.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Transactional self-service changes with source ownership and revision checks. */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { CreateProfileChangeSchema, ReviewProfileChangeSchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { assertPersonnelScope } from './personnel-scope.js';

@Injectable()
export class ProfileChangesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async request(actorId: string, payload: unknown) {
    const input = parseRequest(CreateProfileChangeSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [actorId]);
      await assertPersonnelScope(tx, actorId, 'profile.request', actorId);
      const field = await tx.personnelField.findUnique({
        where: { personId_key: { personId: actorId, key: input.fieldKey } },
      });
      if ((field?.revision ?? 0) !== input.expectedRevision)
        throw new ConflictException('The field has changed. Reload its current revision.');
      const pending = await tx.profileChangeRequest.findFirst({
        where: {
          personId: actorId,
          fieldKey: input.fieldKey,
          status: { in: ['PENDING_APPROVAL', 'PENDING_SYNC'] },
        },
        select: { id: true },
      });
      if (pending) throw new ConflictException('A change for this field is already pending.');
      const request = await tx.profileChangeRequest.create({
        data: { ...input, personId: actorId, ownerSystemId: field?.ownerSystemId ?? null },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROFILE_CHANGE_REQUESTED',
          entityType: 'ProfileChangeRequest',
          entityId: request.id,
          after: { fieldKey: input.fieldKey },
        },
        tx,
      );
      return request;
    });
  }

  async review(actorId: string, id: string, payload: unknown) {
    const input = parseRequest(ReviewProfileChangeSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.profileChangeRequest.findUnique({
        where: { id },
        select: { personId: true },
      });
      if (!initial) throw new NotFoundException('Change request not found.');
      await lockPersonWrites(tx, [initial.personId]);
      await assertPersonnelScope(tx, actorId, 'profile.approve', initial.personId);
      if (actorId === initial.personId)
        throw new ForbiddenException('A profile change requires another authorized reviewer.');
      const request = await tx.profileChangeRequest.findUniqueOrThrow({ where: { id } });
      if (request.status !== 'PENDING_APPROVAL')
        throw new ConflictException('This change has already been reviewed.');
      const field = await tx.personnelField.findUnique({
        where: { personId_key: { personId: request.personId, key: request.fieldKey } },
      });
      const status = profileReviewStatus(input.decision, request, field);
      const updated = await tx.profileChangeRequest.update({
        where: { id },
        data: {
          status,
          reviewerId: actorId,
          reviewedAt: new Date(),
          reason: input.reason,
          resolvedAt: status === 'PENDING_SYNC' ? null : new Date(),
        },
      });
      if (status === 'APPLIED') {
        await tx.personnelField.upsert({
          where: { personId_key: { personId: request.personId, key: request.fieldKey } },
          create: {
            personId: request.personId,
            key: request.fieldKey,
            value: request.requestedValue as Prisma.InputJsonValue,
          },
          update: {
            value: request.requestedValue as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
        if (request.fieldKey === 'firstName' || request.fieldKey === 'lastName') {
          await tx.person.update({
            where: { id: request.personId },
            data: { [request.fieldKey]: String(request.requestedValue) },
          });
        }
      }
      if (status === 'PENDING_SYNC' && request.ownerSystemId) {
        await tx.personnelChangeOutbox.create({
          data: { requestId: id, sourceSystemId: request.ownerSystemId },
        });
      }
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROFILE_CHANGE_REVIEWED',
          entityType: 'ProfileChangeRequest',
          entityId: id,
          after: { status },
          reason: input.reason,
        },
        tx,
      );
      return updated;
    });
  }
}
