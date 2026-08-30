/** Runtime contracts shared by structured and CSV-backed terminal imports. */
import { z } from 'zod';

export const TerminalRecordSchema = z
  .object({
    personId: z.string().cuid(),
    timeTypeCode: z.string().min(1),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    note: z.string().max(1000).optional(),
  })
  .refine(
    (record) =>
      record.endTime === undefined ||
      new Date(record.endTime).getTime() > new Date(record.startTime).getTime(),
    { message: 'endTime must be after startTime', path: ['endTime'] },
  );

/** Runtime contract for a terminal batch submitted as structured records. */
export const TerminalSyncBatchSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  records: z.array(TerminalRecordSchema),
});

const MAX_TERMINAL_CSV_BYTES = 2_000_000;

export const TerminalSyncBatchFileSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  protocol: z.enum(['HONEYWELL_CSV_V1']).default('HONEYWELL_CSV_V1'),
  csv: z.string().min(1).max(MAX_TERMINAL_CSV_BYTES),
});

export const TerminalHeartbeatSchema = z.object({
  terminalId: z.string().min(1),
  observedAt: z.string().datetime(),
  bufferedRecords: z.number().int().min(0).default(0),
  errorCount: z.number().int().min(0).default(0),
  details: z
    .union([
      z.record(z.unknown()),
      z.array(z.unknown()),
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .optional(),
});

export const TerminalImportResultPayloadSchema = z.object({
  totalRecords: z.number().int().min(0),
  rawRows: z.number().int().min(0).optional(),
  validRows: z.number().int().min(0).optional(),
  malformedRows: z.number().int().min(0).optional(),
  created: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  conflictFlags: z.array(
    z.object({
      personId: z.string(),
      startTime: z.string(),
      type: z.enum(['ABSENCE_CONFLICT', 'BOOKING_OVERLAP']),
    }),
  ),
  unknownTimeTypes: z.array(
    z.object({
      personId: z.string(),
      startTime: z.string(),
      timeTypeCode: z.string(),
    }),
  ),
  ingestionChecksum: z.string().length(64),
  sorted: z.literal(true),
});

export type TerminalRecord = z.infer<typeof TerminalRecordSchema>;
export type TerminalSyncBatchInput = z.infer<typeof TerminalSyncBatchSchema>;
export type TerminalSyncBatchFileInput = z.infer<typeof TerminalSyncBatchFileSchema>;
export type TerminalHeartbeatInput = z.infer<typeof TerminalHeartbeatSchema>;
export type TerminalFileMetrics = Pick<
  z.infer<typeof TerminalImportResultPayloadSchema>,
  'rawRows' | 'validRows' | 'malformedRows'
>;
