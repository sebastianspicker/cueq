import { randomUUID } from 'node:crypto';
/** Database writes and encrypted objects are paired with explicit failure compensation. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DocumentObjectStorage, type DocumentObjectManifest, type Prisma } from '@cueq/database';
import { CreatePersonnelDocumentSchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper, CapabilityHelper } from '../people/public.js';
import { assertDocumentScope, assertDocumentCreationScope } from './document-scope.js';

type Version = Prisma.PersonnelDocumentVersionGetPayload<object>;
function versionDto(v: Version) {
  return {
    id: v.id,
    documentId: v.documentId,
    version: v.version,
    checksum: v.checksum,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
    createdAt: v.createdAt.toISOString(),
    acknowledgedAt: null,
  };
}
function storage() {
  try {
    return DocumentObjectStorage.fromEnvironment();
  } catch {
    throw new ServiceUnavailableException('Private document storage is not configured.');
  }
}

@Injectable()
export class DocumentCommandsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async create(actorId: string, payload: unknown) {
    const input = parseRequest(CreatePersonnelDocumentSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await assertDocumentCreationScope(tx, actorId, input.personId, input.assignmentId);
      storage();
      await lockPersonWrites(tx, [input.personId]);
      const resolved = await this.assignments.resolveInterval(
        input.personId,
        new Date(),
        undefined,
        input.assignmentId,
        tx,
      );
      await this.capabilities.assert(
        actorId,
        'documents.manage',
        { personId: input.personId, organizationUnitId: resolved.organizationUnitId },
        tx,
      );
      const document = await tx.personnelDocument.create({
        data: {
          ...input,
          organizationUnitId: resolved.organizationUnitId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          retainUntil: input.retainUntil ? new Date(input.retainUntil) : null,
          createdById: actorId,
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'DOCUMENT_CREATED',
          entityType: 'PersonnelDocument',
          entityId: document.id,
          after: { assignmentId: input.assignmentId },
        },
        tx,
      );
      return document;
    });
  }

  async upload(
    actorId: string,
    documentId: string,
    expectedVersion: number,
    content: Buffer,
    declaredType: string,
  ) {
    await assertDocumentScope(this.prisma, actorId, 'documents.manage', documentId);
    const objects = storage();
    const upload = await this.prisma.documentUpload.create({
      data: { documentId, actorId, objectKey: randomUUID() + '.enc' },
    });
    let manifest: DocumentObjectManifest;
    try {
      manifest = await objects.write(content, declaredType, upload.objectKey);
    } catch (error) {
      if (
        error instanceof Error &&
        ['DOCUMENT_SIZE_INVALID', 'DOCUMENT_TYPE_INVALID'].includes(error.message)
      )
        throw new BadRequestException(
          'Upload must be a PDF, PNG or JPEG of at most 10 MiB with a matching file signature.',
        );
      throw new ServiceUnavailableException('Private document storage is unavailable.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM document_uploads WHERE id = ${upload.id} FOR UPDATE`;
      const intent = await tx.documentUpload.findUniqueOrThrow({ where: { id: upload.id } });
      if (intent.status !== 'PENDING')
        throw new ConflictException('Upload was abandoned; start a new upload.');
      await assertDocumentScope(tx, actorId, 'documents.manage', documentId);
      const document = await tx.personnelDocument.findUniqueOrThrow({
        where: { id: documentId },
      });
      await lockPersonWrites(tx, [document.personId]);
      const latest = await tx.personnelDocumentVersion.findFirst({
        where: { documentId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if ((latest?.version ?? 0) !== expectedVersion)
        throw new ConflictException('Document version changed. Reload before uploading.');
      const version = await tx.personnelDocumentVersion.create({
        data: { ...manifest, documentId, version: expectedVersion + 1, uploadedById: actorId },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'DOCUMENT_VERSION_UPLOADED',
          entityType: 'PersonnelDocumentVersion',
          entityId: version.id,
          after: { documentId, version: version.version, checksum: version.checksum },
        },
        tx,
      );
      await tx.documentUpload.update({
        where: { id: upload.id },
        data: { status: 'COMMITTED', settledAt: new Date() },
      });
      return versionDto(version);
    });
    // Recovery uses the durable upload lock if the commit outcome is uncertain.
  }

  async download(actorId: string, documentId: string, versionId: string) {
    await assertDocumentScope(this.prisma, actorId, 'documents.read', documentId);
    const version = await this.prisma.personnelDocumentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) throw new NotFoundException('Document version not found.');
    let content: Buffer;
    try {
      content = await storage().read(version as DocumentObjectManifest);
    } catch {
      throw new ServiceUnavailableException('Document content could not be verified.');
    }
    await this.audit.appendAudit({
      actorId,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'PersonnelDocumentVersion',
      entityId: versionId,
      after: { documentId },
    });
    return {
      content,
      mimeType: version.mimeType,
      fileName: `${documentId}-v${version.version}.${version.mimeType === 'application/pdf' ? 'pdf' : version.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    };
  }

  async acknowledge(actorId: string, documentId: string, versionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await assertDocumentScope(tx, actorId, 'documents.read', documentId);
      await assertDocumentScope(tx, actorId, 'documents.acknowledge', documentId);
      await lockPersonWrites(tx, [actorId]);
      const version = await tx.personnelDocumentVersion.findFirst({
        where: { id: versionId, documentId },
        select: { id: true },
      });
      if (!version) throw new NotFoundException('Document version not found.');
      const existing = await tx.documentAcknowledgement.findUnique({
        where: { versionId_actorId: { versionId, actorId } },
      });
      if (existing) return existing;
      const acknowledgement = await tx.documentAcknowledgement.create({
        data: { versionId, actorId },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'DOCUMENT_ACKNOWLEDGED',
          entityType: 'PersonnelDocumentVersion',
          entityId: versionId,
          after: { documentId, acknowledgedAt: acknowledgement.acknowledgedAt.toISOString() },
        },
        tx,
      );
      return acknowledgement;
    });
  }
}
