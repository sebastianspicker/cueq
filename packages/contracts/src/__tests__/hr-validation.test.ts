import { describe, expect, it } from 'vitest';
import {
  SplitTimeAccountSchema,
  LifecycleDefinitionSchema,
  CreateLifecycleAutomationSchema,
  CreateProjectMembershipSchema,
  CreateProfileChangeSchema,
  CreateHrSourceSchema,
  CreatePersonnelRelationshipSchema,
} from '../index.js';
const id = 'c000000000000000000000001';
const other = 'c000000000000000000000002';
const task = (key: string, dependsOn: string[] = []) => ({
  key,
  title: key,
  description: '',
  responsibleKind: 'SUBJECT',
  responsibleId: null,
  dueOffsetDays: 0,
  dependsOn,
  blocking: true,
});

describe('native HR configuration boundaries', () => {
  it('accepts ordered dependencies and rejects cycles, missing targets and duplicate keys', () => {
    expect(
      LifecycleDefinitionSchema.safeParse({
        tasks: [task('welcome'), task('account', ['welcome'])],
      }).success,
    ).toBe(true);
    for (const tasks of [
      [task('a', ['b']), task('b', ['a'])],
      [task('a', ['missing'])],
      [task('a'), task('a')],
    ])
      expect(LifecycleDefinitionSchema.safeParse({ tasks }).success).toBe(false);
    expect(
      LifecycleDefinitionSchema.safeParse({
        tasks: [{ ...task('a'), responsibleKind: 'GROUP', responsibleId: id }],
      }).success,
    ).toBe(true);
    expect(
      LifecycleDefinitionSchema.safeParse({ tasks: [{ ...task('a'), responsibleKind: 'GROUP' }] })
        .success,
    ).toBe(false);
  });
  it('allowlists automation triggers/conditions and enforces date trigger configuration', () => {
    const rule = {
      name: 'Synthetic onboarding',
      templateId: id,
      organizationUnitId: other,
      trigger: 'DATE',
      triggerDate: '2026-10-01',
      offsetDays: 0,
      conditions: {},
    };
    expect(CreateLifecycleAutomationSchema.safeParse(rule).success).toBe(true);
    expect(CreateLifecycleAutomationSchema.safeParse({ ...rule, triggerDate: null }).success).toBe(
      false,
    );
    expect(
      CreateLifecycleAutomationSchema.safeParse({ ...rule, conditions: { script: 'arbitrary()' } })
        .success,
    ).toBe(false);
    expect(
      CreateLifecycleAutomationSchema.safeParse({
        ...rule,
        trigger: 'APPOINTMENT_START',
        triggerDate: null,
      }).success,
    ).toBe(true);
  });
  it('rejects unauthorized attribute vocabularies and invalid effective intervals', () => {
    expect(
      CreateProfileChangeSchema.safeParse({
        fieldKey: 'role',
        requestedValue: 'ADMIN',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
    expect(
      CreateProfileChangeSchema.safeParse({
        fieldKey: 'phone',
        requestedValue: 'synthetic',
        expectedRevision: 0,
      }).success,
    ).toBe(true);
    expect(
      CreateHrSourceSchema.safeParse({
        code: 'synthetic',
        name: 'Synthetic',
        ownershipProfile: { role: 'SOURCE' },
      }).success,
    ).toBe(false);
    const interval = { effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-09-01T00:00:00Z' };
    expect(
      CreateProjectMembershipSchema.safeParse({ personId: id, assignmentId: other, ...interval })
        .success,
    ).toBe(false);
    expect(
      CreatePersonnelRelationshipSchema.safeParse({
        subjectPersonId: id,
        relatedPersonId: other,
        kind: 'MENTOR',
        ...interval,
      }).success,
    ).toBe(false);
  });
});

it('requires exact bounded hour values and revision context for account splitting', () => {
  const segment = {
    periodStart: '2026-03-01T00:00:00Z',
    periodEnd: '2026-03-15T00:00:00Z',
    targetHours: 40,
    actualHours: 42.25,
    balance: 2.25,
    overtimeHours: 1.25,
  };
  const input = {
    expectedUpdatedAt: '2026-03-01T00:00:00Z',
    reason: 'Synthetic exact split',
    segments: [
      segment,
      { ...segment, periodStart: segment.periodEnd, periodEnd: '2026-04-01T00:00:00Z' },
    ],
  };
  expect(SplitTimeAccountSchema.safeParse(input).success).toBe(true);
  for (const patch of [
    { balance: 3 },
    { actualHours: 42.251 },
    { overtimeHours: -1 },
    { targetHours: 1e10 },
    { periodEnd: segment.periodStart },
  ]) {
    expect(
      SplitTimeAccountSchema.safeParse({
        ...input,
        segments: [{ ...segment, ...patch }, input.segments[1]],
      }).success,
    ).toBe(false);
  }
  expect(SplitTimeAccountSchema.safeParse({ ...input, expectedUpdatedAt: undefined }).success).toBe(
    false,
  );
});
