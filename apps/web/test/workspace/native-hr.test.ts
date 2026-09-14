import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import {
  CreateEmploymentTermSchema,
  CreateHrSourceSchema,
  CreateProfileChangeSchema,
} from '@cueq/contracts';
import { nativePayload } from '../../src/shared/native-hr/native-payload';
import { nativeFailure } from '../../src/shared/native-hr/use-native-resource';
import { NativePanel } from '../../src/shared/native-hr/native-panels';
import { ApiRequestError } from '../../src/platform/http/api-client';
import { termFields } from '../../src/app/[locale]/employment/employment-fields';
import en from '../../src/messages/en.json';
import de from '../../src/messages/de.json';

const id = `c${'a'.repeat(24)}`;
describe('native HR form boundaries', () => {
  it('preserves explicit ownership instead of assigning it from the signed-in appointment', () => {
    const fields = [{ key: 'code' }, { key: 'name' }, { key: 'ownershipProfile.phone' }];
    const body = CreateHrSourceSchema.parse(
      nativePayload(fields, {
        code: 'synthetic',
        name: 'Synthetic source',
        'ownershipProfile.phone': 'SOURCE',
      }),
    );
    expect(body).toEqual({
      code: 'synthetic',
      name: 'Synthetic source',
      ownershipProfile: { phone: 'SOURCE' },
    });
    expect(body).not.toHaveProperty('assignmentId');
  });
  it('preserves source revision null and omits blank optional fields', () => {
    expect(
      nativePayload(
        [
          { key: 'expectedSourceRevision', nullable: true },
          { key: 'fields.phone', optional: true },
          { key: 'fields.address', optional: true },
        ],
        { 'fields.phone': 'Synthetic phone' },
      ),
    ).toEqual({ expectedSourceRevision: null, fields: { phone: 'Synthetic phone' } });
  });
  it('carries Berlin effective time, numeric terms, null references, and explicit policy references', () => {
    const body = CreateEmploymentTermSchema.parse(
      nativePayload(termFields, {
        effectiveFrom: '2027-01-01T09:00',
        organizationUnitId: id,
        weeklyHours: '20',
        dailyTargetHours: '4',
        workingDays: '1,2,3,4,5',
        employmentGroupId: id,
        holidayCalendarId: id,
      }),
    );
    expect(body.effectiveFrom).toBe('2027-01-01T08:00:00.000Z');
    expect(body.weeklyHours).toBe(20);
    expect(body.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(body.supervisorId).toBeNull();
    expect(body.policyReferences).toEqual({});
  });
  it('uses the loaded profile revision in the change request contract', () => {
    const body = {
      fieldKey: 'phone',
      expectedRevision: 7,
      ...nativePayload([{ key: 'requestedValue' }], { requestedValue: 'Synthetic change' }),
    };
    expect(CreateProfileChangeSchema.parse(body).expectedRevision).toBe(7);
    expect(() =>
      CreateProfileChangeSchema.parse({ ...body, expectedRevision: undefined }),
    ).toThrow();
  });
  it('splits holiday input into dates without changing dates', () => {
    expect(
      nativePayload([{ key: 'holidayDates', type: 'list' }], {
        holidayDates: '2027-01-01\n2027-12-25, 2027-12-26',
      }),
    ).toEqual({ holidayDates: ['2027-01-01', '2027-12-25', '2027-12-26'] });
  });
  it.each([
    [401, 'restricted'],
    [403, 'restricted'],
    [409, 'conflict'],
    [500, 'error'],
  ] as const)('classifies HTTP %s without exposing server error text', (status, phase) => {
    expect(nativeFailure(new ApiRequestError(status, 'synthetic private detail', null))).toBe(
      phase,
    );
  });
});

describe('native HR disclosure and localization', () => {
  it.each(['restricted', 'loading', 'error', 'conflict'] as const)(
    'does not render previous records during %s',
    (phase) => {
      const html = renderToStaticMarkup(
        createElement(
          NextIntlClientProvider,
          { locale: 'en', messages: en, timeZone: 'Europe/Berlin', children: null },
          createElement(NativePanel, {
            title: 'profile',
            phase,
            reload: async () => {},
            children: createElement('p', null, 'SYNTHETIC_RESTRICTED_RECORD'),
          }),
        ),
      );
      expect(html).not.toContain('SYNTHETIC_RESTRICTED_RECORD');
      expect(html).not.toContain('synthetic private detail');
    },
  );
  it('keeps native message keys aligned in German and English', () => {
    const keys = (value: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, entry]) =>
        entry && typeof entry === 'object'
          ? keys(entry as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    expect(keys(de.pages.nativeHr).sort()).toEqual(keys(en.pages.nativeHr).sort());
  });
});
