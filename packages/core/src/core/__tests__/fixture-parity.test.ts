import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateFlextimeWeek,
  calculateProratedMonthlyTarget,
  evaluateTimeRules,
  evaluateOnCallRestCompliance,
  evaluateShiftCompliance,
} from '../..';

const fixturesDir = resolve(process.cwd(), '../../fixtures/reference-calculations');

type Fixture = {
  id: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
};

async function readFixture(fileName: string): Promise<Fixture> {
  const raw = await readFile(resolve(fixturesDir, fileName), 'utf8');
  return JSON.parse(raw) as Fixture;
}

describe('reference fixture parity', () => {
  it('flextime-basic-week fixture matches calculateFlextimeWeek output', async () => {
    const fixture = await readFixture('flextime.json');
    const result = calculateFlextimeWeek(fixture.input as never);
    expect(result.actualHours).toBe(fixture.expected.actualHours);
    expect(result.deltaHours).toBe(fixture.expected.deltaHours);
    expect(result.violations).toEqual(fixture.expected.violations);
  });

  it('pforte-shift-night fixture matches evaluateShiftCompliance output', async () => {
    const fixture = await readFixture('pforte-shift.json');
    const result = evaluateShiftCompliance(fixture.input as never);
    expect(result.workedHours).toBe(fixture.expected.workedHours);
    expect(result.requiredBreakMinutes).toBe(fixture.expected.requiredBreakMinutes);
    expect(result.violations).toEqual(fixture.expected.violations);
  });

  it('part-time-model-change fixture matches calculateProratedMonthlyTarget output', async () => {
    const fixture = await readFixture('part-time-change.json');
    const result = calculateProratedMonthlyTarget(fixture.input as never);
    expect(result.proratedTargetHours).toBe(fixture.expected.proratedTargetHours);
    expect(result.deltaHours).toBe(fixture.expected.deltaHours);
    expect(result.violations).toEqual(fixture.expected.violations);
  });

  it('it-oncall-deployment-rest fixture matches evaluateOnCallRestCompliance output', async () => {
    const fixture = await readFixture('it-oncall.json');
    const result = evaluateOnCallRestCompliance(fixture.input as never);
    expect(result.restHoursAfterDeployment).toBe(fixture.expected.restHoursAfterDeployment);
    expect(result.minimumRestHours).toBe(fixture.expected.minimumRestHours);
    expect(result.compliant).toBe(fixture.expected.compliant);
    expect(result.violations).toEqual(fixture.expected.violations);
  });

  it('time-engine-surcharge-weekend-night fixture matches evaluateTimeRules output', async () => {
    const fixture = await readFixture('time-engine-surcharge-weekend-night.json');
    const result = evaluateTimeRules(fixture.input as never);
    expect(result.actualHours).toBe(fixture.expected.actualHours);
    expect(result.deltaHours).toBe(fixture.expected.deltaHours);
    expect(result.violations).toEqual(fixture.expected.violations);
    expect(result.warnings).toEqual(fixture.expected.warnings);
    expect(result.surchargeMinutes).toEqual(fixture.expected.surchargeMinutes);
  });

  it('time-engine-surcharge-holiday-overlap fixture matches evaluateTimeRules output', async () => {
    const fixture = await readFixture('time-engine-surcharge-holiday-overlap.json');
    const result = evaluateTimeRules(fixture.input as never);
    expect(result.actualHours).toBe(fixture.expected.actualHours);
    expect(result.deltaHours).toBe(fixture.expected.deltaHours);
    expect(result.violations).toEqual(fixture.expected.violations);
    expect(result.warnings).toEqual(fixture.expected.warnings);
    expect(result.surchargeMinutes).toEqual(fixture.expected.surchargeMinutes);
  });
});
