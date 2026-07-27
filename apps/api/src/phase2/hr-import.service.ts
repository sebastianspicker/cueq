/** Implements validated, auditable HR master-data import runs. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, Role, WorkTimeModelType } from '@cueq/database';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service.js';
import { assertIntegrationToken } from '../common/integrations/integration-token.js';
import { parseCsvRecords } from '../common/csv/parse-csv.js';
import { AuditHelper } from './helpers/audit.helper.js';
import { lockPersonWrites } from './helpers/transaction-lock.helper.js';
import {
  HR_MASTER_PROVIDER,
  type HrMasterProviderPort,
  type HrMasterRecord,
} from './hr-master-provider.port.js';

const MAX_HR_IMPORT_CSV_BYTES = 2_000_000;
// TV-L full-time: 39 h 50 min/week (39.83 h), 7.97 h/day
const DEFAULT_WEEKLY_HOURS = 39.83;
const DEFAULT_DAILY_TARGET_HOURS = 7.97;
const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;

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

type HrImportTransaction = Prisma.TransactionClient;

function csvField(row: Record<string, string>, key: string, fallback: string): string {
  return row[key] ?? fallback;
}

function parsedRowFromCsv(row: Record<string, string>): ParsedRow {
  const supervisorExternalId = row['supervisorExternalId'];
  return {
    externalId: csvField(row, 'externalId', ''),
    firstName: csvField(row, 'firstName', ''),
    lastName: csvField(row, 'lastName', ''),
    email: csvField(row, 'email', ''),
    role: csvField(row, 'role', 'EMPLOYEE'),
    organizationUnit: csvField(row, 'organizationUnit', 'Unassigned'),
    workTimeModel: csvField(row, 'workTimeModel', 'Default'),
    weeklyHours: csvField(row, 'weeklyHours', String(DEFAULT_WEEKLY_HOURS)),
    dailyTargetHours: csvField(row, 'dailyTargetHours', String(DEFAULT_DAILY_TARGET_HOURS)),
    supervisorExternalId: supervisorExternalId || undefined,
  };
}

function hasRequiredIdentity(row: ParsedRow): boolean {
  return Boolean(row.externalId && row.email && row.firstName && row.lastName);
}

function parseNonnegativeHours(value: string, fallback: number): number | null {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Imports HR master data as a serialized, auditable reconciliation run.
 *
 * Per-person writes are locked so retries cannot race identity or work-time-model updates.
 */
@Injectable()
export class HrImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HR_MASTER_PROVIDER) private readonly provider: HrMasterProviderPort,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private parseCsv(csv: string): ParsedRow[] {
    const { rows } = parseCsvRecords(csv);
    return rows.map(parsedRowFromCsv);
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

    const validatedRows: ValidatedRow[] = [];
    for (const row of rows) {
      const validated = this.validateRow(row, seenExternalIds, seenEmails);
      if (typeof validated === 'string') errors.push(validated);
      else validatedRows.push(validated);
    }

    const byExternalId = new Map(validatedRows.map((row) => [row.externalId, row]));
    for (const row of validatedRows) {
      if (row.supervisorExternalId === row.externalId) {
        errors.push(`Supervisor cycle detected for externalId="${row.externalId}".`);
        continue;
      }
      const visited = new Set([row.externalId]);
      let supervisorExternalId = row.supervisorExternalId;
      while (supervisorExternalId && byExternalId.has(supervisorExternalId)) {
        if (visited.has(supervisorExternalId)) {
          errors.push(`Supervisor cycle detected for externalId="${row.externalId}".`);
          break;
        }
        visited.add(supervisorExternalId);
        supervisorExternalId = byExternalId.get(supervisorExternalId)?.supervisorExternalId;
      }
    }

    return { rows: validatedRows, errors: [...new Set(errors)] };
  }

  private validateRow(
    row: ParsedRow,
    seenExternalIds: Set<string>,
    seenEmails: Set<string>,
  ): ValidatedRow | string {
    if (!hasRequiredIdentity(row)) {
      return `Missing required fields for externalId="${row.externalId}".`;
    }
    const normalizedEmail = row.email.toLowerCase();
    if (seenExternalIds.has(row.externalId)) {
      return `Duplicate externalId in batch: "${row.externalId}".`;
    }
    if (seenEmails.has(normalizedEmail)) return `Duplicate email in batch: "${row.email}".`;

    const parsedWeeklyHours = parseNonnegativeHours(row.weeklyHours, DEFAULT_WEEKLY_HOURS);
    const parsedDailyTargetHours = parseNonnegativeHours(
      row.dailyTargetHours,
      DEFAULT_DAILY_TARGET_HOURS,
    );
    if (parsedWeeklyHours === null) {
      return `Invalid weeklyHours for externalId="${row.externalId}".`;
    }
    if (parsedDailyTargetHours === null) {
      return `Invalid dailyTargetHours for externalId="${row.externalId}".`;
    }

    let parsedRole: Role;
    try {
      parsedRole = this.toRole(row.role);
    } catch (error) {
      return error instanceof Error ? error.message : `Unsupported HR role: ${row.role}`;
    }
    seenExternalIds.add(row.externalId);
    seenEmails.add(normalizedEmail);
    return {
      ...row,
      parsedRole,
      parsedWeeklyHours,
      parsedDailyTargetHours,
      organizationUnitId: `ou_${row.organizationUnit.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
      workTimeModelId: `wtm_${row.workTimeModel.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
    };
  }

  private async finalizeRun(
    summary: {
      source: 'FILE' | 'API';
      sourceFile: string | null;
      totalRows: number;
      createdRows: number;
      updatedRows: number;
      skippedRows: number;
      errorCount: number;
      errors: string[];
    },
    db: HrImportTransaction = this.prisma,
  ) {
    const run = await db.hrImportRun.create({
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

    await this.auditHelper.appendAudit(
      {
        actorId: 'system:hr-import',
        action: 'HR_MASTER_IMPORT_COMPLETED',
        entityType: 'HrImportRun',
        entityId: run.id,
        after: summary,
        reason: summary.source,
      },
      db,
    );

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

  private async findExistingPersonForRow(tx: HrImportTransaction, row: ValidatedRow) {
    const [byExternalId, byEmail] = await Promise.all([
      tx.person.findUnique({
        where: { externalId: row.externalId },
        select: { id: true },
      }),
      tx.person.findFirst({
        where: { email: { equals: row.email, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);

    if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
      throw new BadRequestException(
        `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
      );
    }

    return byExternalId ?? byEmail;
  }

  private personDataForRow(row: ValidatedRow) {
    return {
      externalId: row.externalId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: row.parsedRole,
      organizationUnitId: row.organizationUnitId,
      workTimeModelId: row.workTimeModelId,
    };
  }

  private async upsertOrganizationUnit(tx: HrImportTransaction, row: ValidatedRow) {
    await tx.organizationUnit.upsert({
      where: { id: row.organizationUnitId },
      create: {
        id: row.organizationUnitId,
        name: row.organizationUnit,
      },
      update: { name: row.organizationUnit },
    });
  }

  private async upsertWorkTimeModel(tx: HrImportTransaction, row: ValidatedRow) {
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
  }

  private async upsertPersonForRow(tx: HrImportTransaction, row: ValidatedRow) {
    const existing = await this.findExistingPersonForRow(tx, row);
    const data = this.personDataForRow(row);
    const person = existing
      ? await tx.person.update({
          where: { id: existing.id },
          data,
        })
      : await tx.person.create({ data });

    return { person, existing };
  }

  private async importValidatedRows(tx: HrImportTransaction, rows: ValidatedRow[]) {
    const importedPeople = new Map<string, string>();
    let createdRows = 0;
    let updatedRows = 0;

    for (const row of rows) {
      await this.upsertOrganizationUnit(tx, row);
      await this.upsertWorkTimeModel(tx, row);
      const { person, existing } = await this.upsertPersonForRow(tx, row);

      importedPeople.set(row.externalId, person.id);
      if (existing) {
        updatedRows += 1;
      } else {
        createdRows += 1;
      }
    }

    return { importedPeople, createdRows, updatedRows };
  }

  private async preflightRows(tx: HrImportTransaction, rows: ValidatedRow[]): Promise<void> {
    const batchExternalIds = new Set(rows.map((row) => row.externalId));
    for (const row of rows) {
      await this.findExistingPersonForRow(tx, row);
      if (row.supervisorExternalId && !batchExternalIds.has(row.supervisorExternalId)) {
        const supervisor = await tx.person.findFirst({
          where: { externalId: row.supervisorExternalId },
          select: { id: true },
        });
        if (!supervisor) {
          throw new BadRequestException(
            `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
          );
        }
      }
    }
  }

  private async lockExistingPeopleForRows(tx: HrImportTransaction, rows: ValidatedRow[]) {
    const existingPersonIds = new Set<string>();
    for (const row of rows) {
      const existing = await this.findExistingPersonForRow(tx, row);
      if (existing) {
        existingPersonIds.add(existing.id);
      }
    }

    await lockPersonWrites(tx, existingPersonIds);
  }

  private async resolveSupervisorId(
    tx: HrImportTransaction,
    row: ValidatedRow,
    importedPeople: Map<string, string>,
  ) {
    if (!row.supervisorExternalId) {
      return null;
    }

    return (
      importedPeople.get(row.supervisorExternalId) ??
      (
        await tx.person.findFirst({
          where: { externalId: row.supervisorExternalId },
          select: { id: true },
        })
      )?.id ??
      null
    );
  }

  private async linkSupervisors(
    tx: HrImportTransaction,
    rows: ValidatedRow[],
    importedPeople: Map<string, string>,
  ) {
    for (const row of rows) {
      const personId = importedPeople.get(row.externalId);
      if (!personId) {
        throw new BadRequestException(`Imported person missing for externalId: ${row.externalId}`);
      }

      const supervisorId = await this.resolveSupervisorId(tx, row, importedPeople);
      if (row.supervisorExternalId && !supervisorId) {
        throw new BadRequestException(
          `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
        );
      }

      await tx.person.update({
        where: { id: personId },
        data: { supervisorId },
      });
    }
  }

  private async importRowsInTransaction(
    validatedRows: ValidatedRow[],
    baseSummary: {
      source: 'FILE' | 'API';
      sourceFile: string | null;
      totalRows: number;
      createdRows: number;
      updatedRows: number;
      skippedRows: number;
      errorCount: number;
      errors: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${HR_IMPORT_ADVISORY_LOCK_NAMESPACE}) AS acquired
      `;
      if (!lock?.acquired) {
        throw new ConflictException({
          code: 'HR_IMPORT_IN_PROGRESS',
          message: 'Another HR import is already in progress.',
          retryable: true,
        });
      }
      await this.lockExistingPeopleForRows(tx, validatedRows);
      await this.preflightRows(tx, validatedRows);
      const result = await this.importValidatedRows(tx, validatedRows);
      await this.linkSupervisors(tx, validatedRows, result.importedPeople);

      return this.finalizeRun(
        {
          ...baseSummary,
          createdRows: result.createdRows,
          updatedRows: result.updatedRows,
          skippedRows: 0,
          errorCount: 0,
          errors: [],
        },
        tx,
      );
    });
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
      throw new BadRequestException({
        code: 'HR_IMPORT_VALIDATION_FAILED',
        message: 'HR import payload validation failed.',
        errors,
      });
    }

    try {
      return await this.importRowsInTransaction(validatedRows, baseSummary);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      return this.prisma.$transaction((tx) =>
        this.finalizeRun(
          {
            ...baseSummary,
            errorCount: 1,
            errors: [error instanceof Error ? error.message : 'Unknown HR import error'],
          },
          tx,
        ),
      );
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
