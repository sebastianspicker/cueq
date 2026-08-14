import { describe, expect, it } from 'vitest';
import {
  createTerminalIngestionChecksum,
  normalizeTerminalRecords,
  terminalRecordDedupeKey,
} from './terminal-import-normalization.js';

const PERSON_ID = 'cm0000000000000000000001';
const OTHER_PERSON_ID = 'cm0000000000000000000002';

describe('terminal import normalization', () => {
  const firstRecord = {
    personId: PERSON_ID,
    timeTypeCode: 'WORK',
    startTime: '2026-07-14T08:00:00.000Z',
    endTime: '2026-07-14T12:00:00.000Z',
  };
  const equalImportIdentityWithAnotherNote = { ...firstRecord, note: 'terminal note' };
  const laterRecord = {
    ...firstRecord,
    personId: OTHER_PERSON_ID,
    startTime: '2026-07-14T09:00:00.000Z',
  };

  it('sorts canonically and keeps the first payload record for an import duplicate', () => {
    const normalized = normalizeTerminalRecords([
      laterRecord,
      equalImportIdentityWithAnotherNote,
      firstRecord,
    ]);

    expect(normalized).toEqual({
      canonicalRecords: [firstRecord, laterRecord],
      duplicateRecordsInPayload: 1,
    });
    expect(terminalRecordDedupeKey(firstRecord)).toBe(
      terminalRecordDedupeKey(equalImportIdentityWithAnotherNote),
    );
  });

  it('creates an order-independent checksum from canonical records', () => {
    const first = normalizeTerminalRecords([laterRecord, firstRecord]).canonicalRecords;
    const second = normalizeTerminalRecords([firstRecord, laterRecord]).canonicalRecords;

    expect(createTerminalIngestionChecksum('terminal-1', second)).toBe(
      createTerminalIngestionChecksum('terminal-1', first),
    );
  });
});
