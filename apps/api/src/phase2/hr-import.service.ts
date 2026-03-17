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

    return Role.EMPLOYEE;
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

    let createdRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let errorCount = 0;
    const errors: string[] = [];

    const upsertedPeople: Array<{
      externalId: string;
      personId: string;
      supervisorExternalId?: string;
    }> = [];

    for (const row of rows) {
      if (!row.externalId || !row.email || !row.firstName || !row.lastName) {
        skippedRows += 1;
        errors.push(`Skipped row with missing required fields for externalId="${row.externalId}".`);
        continue;
      }

      try {
        const organizationUnit = await this.prisma.organizationUnit.upsert({
          where: {
            id: `ou_${row.organizationUnit.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
          },
          create: {
            id: `ou_${row.organizationUnit.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
            name: row.organizationUnit,
          },
          update: {
            name: row.organizationUnit,
          },
        });

        const modelId = `wtm_${row.workTimeModel.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`;
        const weeklyHours = Number(row.weeklyHours || DEFAULT_WEEKLY_HOURS);
        const dailyTargetHours = Number(row.dailyTargetHours || DEFAULT_DAILY_TARGET_HOURS);
        await this.prisma.workTimeModel.upsert({
          where: { id: modelId },
          create: {
            id: modelId,
            name: row.workTimeModel,
            type: WorkTimeModelType.FLEXTIME,
            weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : DEFAULT_WEEKLY_HOURS,
            dailyTargetHours: Number.isFinite(dailyTargetHours) ? dailyTargetHours : DEFAULT_DAILY_TARGET_HOURS,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
          update: {
            name: row.workTimeModel,
            weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : DEFAULT_WEEKLY_HOURS,
            dailyTargetHours: Number.isFinite(dailyTargetHours) ? dailyTargetHours : DEFAULT_DAILY_TARGET_HOURS,
          },
        });

        const existing = await this.prisma.person.findFirst({
          where: {
            OR: [{ externalId: row.externalId }, { email: row.email }],
          },
        });

        const person = existing
          ? await this.prisma.person.update({
              where: { id: existing.id },
              data: {
                externalId: row.externalId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                role: this.toRole(row.role),
                organizationUnitId: organizationUnit.id,
                workTimeModelId: modelId,
              },
            })
          : await this.prisma.person.create({
              data: {
                externalId: row.externalId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                role: this.toRole(row.role),
                organizationUnitId: organizationUnit.id,
                workTimeModelId: modelId,
              },
            });

        if (existing) {
          updatedRows += 1;
        } else {
          createdRows += 1;
        }

        upsertedPeople.push({
          externalId: row.externalId,
          personId: person.id,
          supervisorExternalId: row.supervisorExternalId,
        });
      } catch (error) {
        errorCount += 1;
        errors.push(
          `Failed row externalId="${row.externalId}": ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    for (const relation of upsertedPeople) {
      if (!relation.supervisorExternalId) {
        continue;
      }

      const supervisor = upsertedPeople.find(
        (candidate) => candidate.externalId === relation.supervisorExternalId,
      );
      if (!supervisor) {
        continue;
      }

      await this.prisma.person.update({
        where: { id: relation.personId },
        data: { supervisorId: supervisor.personId },
      });
    }

    const summary = {
      source: parsedPayload.source,
      sourceFile: parsedPayload.sourceFile ?? null,
      totalRows: rows.length,
      createdRows,
      updatedRows,
      skippedRows,
      errorCount,
      errors,
    };

    const run = await this.prisma.hrImportRun.create({
      data: {
        source: parsedPayload.source,
        sourceFile: parsedPayload.sourceFile,
        status: errorCount > 0 ? 'FAILED' : 'SUCCEEDED',
        totalRows: rows.length,
        createdRows,
        updatedRows,
        skippedRows,
        errorCount,
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
      reason: parsedPayload.source,
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
