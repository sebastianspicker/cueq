/** Durable staging recovery never deletes an object while its metadata commit is unresolved. */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DocumentObjectStorage } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';

@Injectable()
export class DocumentRecoveryService implements OnModuleInit {
  private running = false;
  private readonly logger = new Logger(DocumentRecoveryService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.poll();
  }

  @Interval(30_000)
  async poll() {
    if (this.running) return;
    let objects: DocumentObjectStorage;
    try {
      objects = DocumentObjectStorage.fromEnvironment();
    } catch {
      return;
    }
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let cursor: string | undefined;
      for (;;) {
        const rows = await this.prisma.documentUpload.findMany({
          where: {
            status: { in: ['PENDING', 'FAILED'] },
            cleanupAt: null,
            createdAt: { lt: cutoff },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 100,
          select: { id: true },
        });
        for (const row of rows) await this.recoverOne(row.id, objects);
        if (rows.length < 100) break;
        cursor = rows.at(-1)?.id;
      }
    } catch {
      this.logger.warn('Document upload recovery will retry after a storage or database failure.');
    } finally {
      this.running = false;
    }
  }

  async recoverOne(id: string, objects: Pick<DocumentObjectStorage, 'discardUnreferenced'>) {
    const objectKey = await this.prisma.$transaction(async (tx) => {
      // The uploader takes this same row lock before creating a version. It
      // cannot commit after recovery marks the intent FAILED.
      const claimed = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM document_uploads WHERE id = ${id} FOR UPDATE SKIP LOCKED`;
      if (!claimed.length) return null;
      const upload = await tx.documentUpload.findUniqueOrThrow({ where: { id } });
      if (upload.status === 'COMMITTED' || upload.cleanupAt) return null;
      const version = await tx.personnelDocumentVersion.findUnique({
        where: { objectKey: upload.objectKey },
        select: { id: true },
      });
      if (version) {
        await tx.documentUpload.update({
          where: { id },
          data: { status: 'COMMITTED', settledAt: new Date() },
        });
        return null;
      }
      if (upload.status !== 'FAILED')
        await tx.documentUpload.update({
          where: { id },
          data: { status: 'FAILED', settledAt: new Date() },
        });
      return upload.objectKey;
    });
    if (!objectKey) return;
    // Files are discarded only after the FAILED state has committed. A failed
    // or ambiguous recovery commit leaves the object intact for another retry.
    try {
      await objects.discardUnreferenced(objectKey);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A paused writer may not have opened its path yet. Keep the durable
      // intent eligible for another pass rather than finalizing missing bytes.
      return;
    }
    await this.prisma.documentUpload.update({ where: { id }, data: { cleanupAt: new Date() } });
  }
}
