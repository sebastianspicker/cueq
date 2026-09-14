import { describe, expect, it } from 'vitest';
import { buildClosingExportArtifact } from './closing-export-artifact.js';

const account = {
  personId: 'person-1',
  assignmentId: 'assignment-1',
  periodStart: new Date('2026-03-01T00:00:00.000Z'),
  periodEnd: new Date('2026-03-31T23:59:59.000Z'),
  targetHours: 160,
  actualHours: 162.5,
  balance: 2.5,
};

describe('closing export versions', () => {
  it('keeps the historical CSV V1 bytes unchanged', () => {
    const result = buildClosingExportArtifact([account], 'CSV_V1', 'period-1');

    expect(result.artifact).toBe(
      'personId,targetHours,actualHours,balance\nperson-1,160.00,162.50,2.50\n',
    );
    expect(result.rows).toEqual([
      {
        personId: 'person-1',
        targetHours: 160,
        actualHours: 162.5,
        balance: 2.5,
      },
    ]);
  });

  it('adds stable appointment and account interval identifiers to CSV V2', () => {
    const result = buildClosingExportArtifact([account], 'CSV_V2', 'period-1');

    expect(result.artifact).toContain(
      'formatVersion,assignmentId,periodStart,periodEnd,personId,targetHours,actualHours,balance',
    );
    expect(result.artifact).toContain(
      '2,assignment-1,2026-03-01T00:00:00.000Z,2026-03-31T23:59:59.000Z,person-1,160.00,162.50,2.50',
    );
    expect(result.rows[0]).toMatchObject({
      formatVersion: 2,
      assignmentId: 'assignment-1',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.000Z',
    });
  });
});
