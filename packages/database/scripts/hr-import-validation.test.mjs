import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from './hr-import/validation.mjs';
import { validateRows } from './hr-import/validation.mjs';

test('validation normalizes roles, defaults, and generated identifiers', () => {
  const { validatedRows, errors } = validateRows(
    parseCsv(
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours\nE-1,Ada,Lovelace,ADA@example.test,team_lead,Applied Math,Part time,20,4\n',
    ),
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(validatedRows[0], {
    externalId: 'E-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ADA@example.test',
    role: 'team_lead',
    organizationUnit: 'Applied Math',
    workTimeModel: 'Part time',
    weeklyHours: '20',
    dailyTargetHours: '4',
    supervisorExternalId: undefined,
    parsedRole: 'TEAM_LEAD',
    parsedWeeklyHours: 20,
    parsedDailyTargetHours: 4,
    organizationUnitId: 'ou_applied_math',
    workTimeModelId: 'wtm_part_time',
  });
});

test('validation accumulates duplicate identities, invalid hours, roles, and supervisor cycles', () => {
  assert.throws(
    () =>
      validateRows([
        {
          externalId: 'E-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.test',
          role: 'not-a-role',
          organizationUnit: 'Math',
          workTimeModel: 'Default',
          weeklyHours: '39.83',
          dailyTargetHours: '7.97',
        },
      ]),
    /Unsupported HR role: not-a-role/u,
  );

  const result = validateRows([
    {
      externalId: 'E-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: 'oops',
      dailyTargetHours: '7.97',
      supervisorExternalId: 'E-2',
    },
    {
      externalId: 'E-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'ADA@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
      supervisorExternalId: undefined,
    },
    {
      externalId: 'E-2',
      firstName: 'Linus',
      lastName: 'Torvalds',
      email: 'linus@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
      supervisorExternalId: 'E-1',
    },
  ]);

  assert.deepEqual(
    result.validatedRows.map((row) => row.externalId),
    ['E-2'],
  );
  assert.deepEqual(result.errors, [
    'Invalid weeklyHours for externalId="E-1".',
    'Duplicate externalId in batch: "E-1".',
  ]);

  const duplicateEmail = validateRows([
    {
      externalId: 'E-3',
      firstName: 'Barbara',
      lastName: 'Liskov',
      email: 'barbara@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
    },
    {
      externalId: 'E-4',
      firstName: 'Donald',
      lastName: 'Knuth',
      email: 'BARBARA@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
    },
  ]);
  assert.deepEqual(duplicateEmail.errors, ['Duplicate email in batch: "BARBARA@example.test".']);

  const invalidDailyHours = validateRows([
    {
      externalId: 'E-5',
      firstName: 'Edsger',
      lastName: 'Dijkstra',
      email: 'edsger@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '-1',
    },
  ]);
  assert.deepEqual(invalidDailyHours.errors, ['Invalid dailyTargetHours for externalId="E-5".']);

  const cycle = validateRows([
    {
      externalId: 'E-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
      supervisorExternalId: 'E-2',
    },
    {
      externalId: 'E-2',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.test',
      role: 'EMPLOYEE',
      organizationUnit: 'Math',
      workTimeModel: 'Default',
      weeklyHours: '39.83',
      dailyTargetHours: '7.97',
      supervisorExternalId: 'E-1',
    },
  ]);
  assert.deepEqual(cycle.errors, [
    'Supervisor cycle detected for externalId="E-1".',
    'Supervisor cycle detected for externalId="E-2".',
  ]);
});
