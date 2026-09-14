'use client';

import { useTranslations } from 'next-intl';
import {
  CreateEmploymentGroupSchema,
  CreateHolidayCalendarSchema,
  EmploymentGroupPageSchema,
  EmploymentGroupSchema,
  HolidayCalendarPageSchema,
  HolidayCalendarSchema,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { calendarFields, groupFields } from './employment-fields';

export function EmploymentConfiguration() {
  const t = useTranslations('pages.nativeHr');
  const groups = useNativeCollection('/v1/employment/groups', EmploymentGroupPageSchema);
  const calendars = useNativeCollection('/v1/employment/calendars', HolidayCalendarPageSchema);
  return (
    <>
      <NativePanel
        title="groups"
        phase={groups.phase}
        empty={!groups.data?.items.length}
        reload={groups.load}
        more={groups.data?.nextCursor ? groups.more : undefined}
      >
        {groups.data?.items.map((item) => (
          <NativeFacts
            key={item.id}
            values={{
              employmentGroupId: item.id,
              code: item.code,
              name: item.name,
              version: item.version,
            }}
          />
        ))}
        <details>
          <summary>{t('createGroup')}</summary>
          <NativeForm
            path="/v1/employment/groups"
            inputSchema={CreateEmploymentGroupSchema}
            responseSchema={EmploymentGroupSchema}
            fields={groupFields}
            after={groups.load}
          />
        </details>
      </NativePanel>
      <NativePanel
        title="calendars"
        phase={calendars.phase}
        empty={!calendars.data?.items.length}
        reload={calendars.load}
        more={calendars.data?.nextCursor ? calendars.more : undefined}
      >
        {calendars.data?.items.map((item) => (
          <NativeFacts
            key={item.id}
            values={{
              holidayCalendarId: item.id,
              code: item.code,
              name: item.name,
              version: item.version,
              holidayDates: item.holidayDates,
            }}
          />
        ))}
        <details>
          <summary>{t('createCalendar')}</summary>
          <NativeForm
            path="/v1/employment/calendars"
            inputSchema={CreateHolidayCalendarSchema}
            responseSchema={HolidayCalendarSchema}
            fields={calendarFields}
            after={calendars.load}
          />
        </details>
      </NativePanel>
    </>
  );
}
