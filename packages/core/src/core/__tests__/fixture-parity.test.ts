import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateFlextimeWeek,
  calculateProratedMonthlyTarget,
  evaluateOnCallRestCompliance,
  evaluateShiftCompliance,
} from '../..';

const fixturesDir = resolve(process.cwd(), '../../fixtures/reference-calculations');

type Fixture = {
  id: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
};

async function readFixture(filePath: string): Promise<Fixture> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as Fixture;
}

describe('reference fixture parity', () => {
  it('passes all known phase-1 reference scenarios', async () => {
    const fixtureFiles = (await readdir(fixturesDir))
      .filter((file) => file.endsWith('.json'))
      .sort();
    expect(fixtureFiles.length).toBe(4);

    for (const file of fixtureFiles) {
      const fixture = await readFixture(resolve(fixturesDir, file));

      if (fixture.id === 'flextime-basic-week') {
        const result = calculateFlextimeWeek(fixture.input as never);
        expect(result.actualHours).toBe(fixture.expected.actualHours);
        expect(result.deltaHours).toBe(fixture.expected.deltaHours);
        expect(result.violations).toEqual(fixture.expected.violations);
        continue;
      }

      if (fixture.id === 'pforte-shift-night') {
        const result = evaluateShiftCompliance(fixture.input as never);
        expect(result.workedHours).toBe(fixture.expected.workedHours);
        expect(result.requiredBreakMinutes).toBe(fixture.expected.requiredBreakMinutes);
        expect(result.violations).toEqual(fixture.expected.violations);
        continue;
      }

      if (fixture.id === 'part-time-model-change') {
        const result = calculateProratedMonthlyTarget(fixture.input as never);
        expect(result.proratedTargetHours).toBe(fixture.expected.proratedTargetHours);
        expect(result.deltaHours).toBe(fixture.expected.deltaHours);
        expect(result.violations).toEqual(fixture.expected.violations);
        continue;
      }

      if (fixture.id === 'it-oncall-deployment-rest') {
        const result = evaluateOnCallRestCompliance(fixture.input as never);
        expect(result.restHoursAfterDeployment).toBe(fixture.expected.restHoursAfterDeployment);
        expect(result.minimumRestHours).toBe(fixture.expected.minimumRestHours);
        expect(result.compliant).toBe(fixture.expected.compliant);
        expect(result.violations).toEqual(fixture.expected.violations);
        continue;
      }

      throw new Error(`Unsupported fixture id: ${fixture.id}`);
    }
  });
});
