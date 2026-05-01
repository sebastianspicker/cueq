import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, Role, WorkTimeModelType } from '@cueq/database';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import { assertIntegrationToken } from '../common/integrations/integration-token';
import { parseCsvRecords } from '../common/csv/parse-csv';
import { AuditHelper } from './helpers/audit.helper';
import {
  HR_MASTER_PROVIDER,
  type HrMasterProviderPort,
  type HrMasterRecord,
} from './hr-master-provider.port';

const MAX_HR_IMPORT_CSV_BYTES = 2_000_000;
// TV-L full-time: 39 h 50 min/week (39.83 h), 7.97 h/day
const DEFAULT_WEEKLY_HOURS = 39.83;
const DEFAULT_DAILY_TARGET_HOURS = 7.97;

const HrImportPayloadSchema = z.object({
  source: z.enum(['FILE', 'API']).default('FILE'),
  sourceFile: z.string().optional(),
  csv: z.string().max(MAX_HR_IMPORT_CSV_BYTES).optional(),
});

type HrImportPayload = z.infer<typeof HrImportPayloadSchema>;

type ParsedRow = HrMasterRecord & {
  supervisorExternalId?: string;
};

type ValidatedRow = ParsedRow & {
  parsedRole: Role;
  parsedWeeklyHours: number;
  parsedDailyTargetHours: number;
  organizationUnitId: string;
  workTimeModelId: string;
};

@Injectable()
export class HrImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HR_MASTER_PROVIDER) private readonly provider: HrMasterProviderPort,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private parseCsv(csv: string): ParsedRow[] {
    const { rows } = parseCsvRecords(csv);
    return rows.map((row) => {
      return {
        externalId: row.externalId ?? '',
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        email: row.email ?? '',
        role: row.role ?? 'EMPLOYEE',
        organizationUnit: row.organizationUnit ?? 'Unassigned',
        workTimeModel: row.workTimeModel ?? 'Default',
        weeklyHours: row.weeklyHours ?? String(DEFAULT_WEEKLY_HOURS),
        dailyTargetHours: row.dailyTargetHours ?? String(DEFAULT_DAILY_TARGET_HOURS),
        supervisorExternalId: row.supervisorExternalId || undefined,
      };
    });
  }

  private toRole(input: string): Role {
    const normalized = input.toUpperCase();
    if (normalized in Role) {
      return Role[normalized as keyof typeof Role];
    }

    throw new BadRequestException(`Unsupported HR role: ${input}`);
  }

  private validateRows(rows: ParsedRow[]): { rows: ValidatedRow[]; errors: string[] } {
    const errors: string[] = [];
    const seenExternalIds = new Set<string>();
    const seenEmails = new Set<string>();

    const validatedRows = rows.flatMap((row) => {
      if (!row.externalId || !row.email || !row.firstName || !row.lastName) {
        errors.push(`Missing required fields for externalId="${row.externalId}".`);
        return [];
      }

      if (seenExternalIds.has(row.externalId)) {
        errors.push(`Duplicate externalId in batch: "${row.externalId}".`);
        return [];
      }
      if (seenEmails.has(row.email.toLowerCase())) {
        errors.push(`Duplicate email in batch: "${row.email}".`);
        return [];
      }

      seenExternalIds.add(row.externalId);
      seenEmails.add(row.email.toLowerCase());

      const parsedWeeklyHours = Number(row.weeklyHours || DEFAULT_WEEKLY_HOURS);
      const parsedDailyTargetHours = Number(row.dailyTargetHours || DEFAULT_DAILY_TARGET_HOURS);
      if (!Number.isFinite(parsedWeeklyHours) || parsedWeeklyHours < 0) {
        errors.push(`Invalid weeklyHours for externalId="${row.externalId}".`);
        return [];
      }
      if (!Number.isFinite(parsedDailyTargetHours) || parsedDailyTargetHours < 0) {
        errors.push(`Invalid dailyTargetHours for externalId="${row.externalId}".`);
        return [];
      }

      let parsedRole: Role;
      try {
        parsedRole = this.toRole(row.role);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Unsupported HR role: ${row.role}`);
        return [];
      }

      return [
        {
          ...row,
          parsedRole,
          parsedWeeklyHours,
          parsedDailyTargetHours,
          organizationUnitId: `ou_${row.organizationUnit.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
          workTimeModelId: `wtm_${row.workTimeModel.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
        },
      ];
    });

    return { rows: validatedRows, errors };
  }

  private async finalizeRun(summary: {
    source: 'FILE' | 'API';
    sourceFile: string | null;
    totalRows: number;
    createdRows: number;
    updatedRows: number;
    skippedRows: number;
    errorCount: number;
    errors: string[];
  }) {
    const run = await this.prisma.hrImportRun.create({
      data: {
        source: summary.source,
        sourceFile: summary.sourceFile ?? undefined,
        status: summary.errorCount > 0 ? 'FAILED' : 'SUCCEEDED',
        totalRows: summary.totalRows,
        createdRows: summary.createdRows,
        updatedRows: summary.updatedRows,
        skippedRows: summary.skippedRows,
        errorCount: summary.errorCount,
        summary: summary as Prisma.InputJsonValue,
        importedById: 'system:hr-import',
      },
    });

    await this.auditHelper.appendAudit({
      actorId: 'system:hr-import',
      action: 'HR_MASTER_IMPORT_COMPLETED',
      entityType: 'HrImportRun',
      entityId: run.id,
      after: summary,
      reason: summary.source,
    });

    return {
      id: run.id,
      source: run.source,
      sourceFile: run.sourceFile,
      status: run.status,
      totalRows: run.totalRows,
      createdRows: run.createdRows,
      updatedRows: run.updatedRows,
      skippedRows: run.skippedRows,
      errorCount: run.errorCount,
      summary: run.summary,
      importedAt: run.importedAt.toISOString(),
    };
  }

  async runImport(token: string | string[] | undefined, payload: unknown) {
    assertIntegrationToken(token, 'HR_IMPORT_TOKEN', 'dev-hr-token');
    const parsedPayload = HrImportPayloadSchema.parse(payload) as HrImportPayload;

    let rows: ParsedRow[] = [];
    if (parsedPayload.source === 'API') {
      rows = await this.provider.fetchMasterRecords();
    } else {
      try {
        rows = this.parseCsv(parsedPayload.csv ?? '');
      } catch (error) {
        throw new BadRequestException(
          `Invalid HR CSV payload: ${error instanceof Error ? error.message : 'parse error'}`,
        );
      }
    }

    const { rows: validatedRows, errors } = this.validateRows(rows);
    const baseSummary = {
      source: parsedPayload.source,
      sourceFile: parsedPayload.sourceFile ?? null,
      totalRows: rows.length,
      createdRows: 0,
      updatedRows: 0,
      skippedRows: rows.length - validatedRows.length,
      errorCount: errors.length,
      errors,
    };

    if (errors.length > 0) {
      return this.finalizeRun(baseSummary);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const importedPeople = new Map<string, string>();
        let createdRows = 0;
        let updatedRows = 0;

        for (const row of validatedRows) {
          await tx.organizationUnit.upsert({
            where: { id: row.organizationUnitId },
            create: {
              id: row.organizationUnitId,
              name: row.organizationUnit,
            },
            update: { name: row.organizationUnit },
          });

          await tx.workTimeModel.upsert({
            where: { id: row.workTimeModelId },
            create: {
              id: row.workTimeModelId,
              name: row.workTimeModel,
              type: WorkTimeModelType.FLEXTIME,
              weeklyHours: row.parsedWeeklyHours,
              dailyTargetHours: row.parsedDailyTargetHours,
              effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
            update: {
              name: row.workTimeModel,
              weeklyHours: row.parsedWeeklyHours,
              dailyTargetHours: row.parsedDailyTargetHours,
            },
          });

          const existing = await tx.person.findFirst({
            where: {
              OR: [{ externalId: row.externalId }, { email: row.email }],
            },
          });

          const person = existing
            ? await tx.person.update({
                where: { id: existing.id },
                data: {
                  externalId: row.externalId,
                  firstName: row.firstName,
                  lastName: row.lastName,
                  email: row.email,
                  role: row.parsedRole,
                  organizationUnitId: row.organizationUnitId,
                  workTimeModelId: row.workTimeModelId,
                },
              })
            : await tx.person.create({
                data: {
                  externalId: row.externalId,
                  firstName: row.firstName,
                  lastName: row.lastName,
                  email: row.email,
                  role: row.parsedRole,
                  organizationUnitId: row.organizationUnitId,
                  workTimeModelId: row.workTimeModelId,
                },
              });

          importedPeople.set(row.externalId, person.id);
          if (existing) {
            updatedRows += 1;
          } else {
            createdRows += 1;
          }
        }

        for (const row of validatedRows) {
          if (!row.supervisorExternalId) {
            continue;
          }

          const supervisorId =
            importedPeople.get(row.supervisorExternalId) ??
            (
              await tx.person.findFirst({
                where: { externalId: row.supervisorExternalId },
                select: { id: true },
              })
            )?.id;
          if (!supervisorId) {
            throw new BadRequestException(
              `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
            );
          }

          const personId = importedPeople.get(row.externalId);
          if (!personId) {
            throw new BadRequestException(
              `Imported person missing for externalId: ${row.externalId}`,
            );
          }

          await tx.person.update({
            where: { id: personId },
            data: { supervisorId },
          });
        }

        return { createdRows, updatedRows };
      });

      return this.finalizeRun({
        ...baseSummary,
        createdRows: result.createdRows,
        updatedRows: result.updatedRows,
        skippedRows: 0,
        errorCount: 0,
      });
    } catch (error) {
      return this.finalizeRun({
        ...baseSummary,
        errorCount: 1,
        errors: [error instanceof Error ? error.message : 'Unknown HR import error'],
      });
    }
  }

  async getRun(token: string | string[] | undefined, runId: string): Promise<unknown> {
    assertIntegrationToken(token, 'HR_IMPORT_TOKEN', 'dev-hr-token');

    const run = await this.prisma.hrImportRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('HR import run not found.');
    }

    return {
      id: run.id,
      source: run.source,
      sourceFile: run.sourceFile,
      status: run.status,
      totalRows: run.totalRows,
      createdRows: run.createdRows,
      updatedRows: run.updatedRows,
      skippedRows: run.skippedRows,
      errorCount: run.errorCount,
      summary: run.summary,
      importedAt: run.importedAt.toISOString(),
    };
  }
}
