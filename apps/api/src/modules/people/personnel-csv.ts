/** Generic CSV records use the same revision and ownership contract as JSON imports. */
import { BadRequestException } from '@nestjs/common';
import { PersonnelFieldKeySchema, ReconcilePersonnelSchema } from '@cueq/contracts';
import { parseCsvRecords } from '../../platform/serialization/csv/parse-csv.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';

export function personnelCsvPayload(csv: string) {
  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(csv);
  } catch {
    throw new BadRequestException('Malformed reconciliation CSV.');
  }
  const required = ['personId', 'externalRecordId', 'expectedSourceRevision', 'revision'];
  const allowed = new Set([...required, ...PersonnelFieldKeySchema.options]);
  if (
    required.some((key) => !parsed.headers.includes(key)) ||
    parsed.headers.some((key) => !allowed.has(key))
  )
    throw new BadRequestException(
      'CSV requires identity and revision columns and supported personnel fields only.',
    );
  return parseRequest(ReconcilePersonnelSchema, {
    records: parsed.rows.map((row) => ({
      personId: row.personId,
      externalRecordId: row.externalRecordId,
      expectedSourceRevision: row.expectedSourceRevision || null,
      revision: row.revision,
      fields: Object.fromEntries(
        PersonnelFieldKeySchema.options
          .filter((key) => Boolean(row[key]))
          .map((key) => [key, row[key]]),
      ),
    })),
  });
}
