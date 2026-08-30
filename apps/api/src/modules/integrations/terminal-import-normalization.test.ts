import { describe, expect, it } from 'vitest';
import {
  createTerminalIngestionChecksum,
  normalizeTerminalRecords,
} from './terminal-import-normalization.js';

describe('terminal import normalization', () => {
  it('sorts records deterministically and removes payload duplicates before checksumming', () => {
    const lateRecord = {
      personId: 'c00000000000000000000002',
      timeTypeCode: 'WORK',
      startTime: '2026-08-04T09:00:00.000Z',
      endTime: '2026-08-04T10:00:00.000Z',
    };
    const earlyRecord = {
      personId: 'c00000000000000000000001',
      timeTypeCode: 'WORK',
      startTime: '2026-08-04T08:00:00.000Z',
      endTime: '2026-08-04T09:00:00.000Z',
    };

    const normalized = normalizeTerminalRecords([lateRecord, earlyRecord, { ...lateRecord }]);
    expect(normalized.duplicateRecordsInPayload).toBe(1);
    expect(normalized.canonicalRecords).toEqual([earlyRecord, lateRecord]);
    expect(createTerminalIngestionChecksum('terminal-1', normalized.canonicalRecords)).toBe(
      createTerminalIngestionChecksum('terminal-1', [earlyRecord, lateRecord]),
    );
  });
});
