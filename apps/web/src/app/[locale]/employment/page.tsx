'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreateEmploymentAssignmentSchema,
  CreateEmploymentTermSchema,
  EmploymentAssignmentPageSchema,
  EmploymentAssignmentSchema,
  EmploymentTermPageSchema,
  EmploymentTermSchema,
} from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { FormField } from '../../../components/FormField';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { assignmentFields, termFields } from './employment-fields';
import { OwnTimeAccounts } from './time-accounts';
import { EmploymentConfiguration } from './employment-configuration';

const CreatedAssignmentSchema = EmploymentAssignmentSchema.omit({
  terms: true,
  termsNextCursor: true,
});
export default function EmploymentPage() {
  const t = useTranslations('pages.nativeHr');
  const [personId, setPersonId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useNativeCollection(
    `/v1/employment/assignments${query}`,
    EmploymentAssignmentPageSchema,
  );
  return (
    <PageShell title={t('employmentTitle')} description={t('employmentDescription')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(personId ? `?personId=${encodeURIComponent(personId)}` : '');
          setSelected(null);
        }}
      >
        <FormField label={t('fields.personId')}>
          <input value={personId} onChange={(event) => setPersonId(event.target.value)} />
        </FormField>
        <button type="submit">{t('search')}</button>
      </form>
      <NativePanel
        title="appointments"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        <ul className="cq-list-stack">
          {resource.data?.items.map((item) => (
            <li key={item.id} className="cq-list-item">
              <button
                type="button"
                className="cq-btn-ghost"
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                {item.label}
              </button>
              <NativeFacts
                values={{
                  assignmentId: item.id,
                  personId: item.personId,
                  sourceSystem: item.sourceSystem,
                  employmentStartDate: item.employmentStartDate,
                  employmentEndDate: item.employmentEndDate,
                }}
              />
              {item.termsNextCursor ? <p>{t('historyAvailable')}</p> : null}
            </li>
          ))}
        </ul>
      </NativePanel>
      {resource.phase === 'ready' &&
      selected &&
      resource.data?.items.some((item) => item.id === selected) ? (
        <EmploymentTerms key={selected} assignmentId={selected} />
      ) : null}
      <SectionCard>
        <details>
          <summary>{t('createAppointment')}</summary>
          <NativeForm
            path="/v1/employment/assignments"
            fields={assignmentFields}
            inputSchema={CreateEmploymentAssignmentSchema}
            responseSchema={CreatedAssignmentSchema}
            after={resource.load}
          />
        </details>
      </SectionCard>
      <OwnTimeAccounts />
      <EmploymentConfiguration />
    </PageShell>
  );
}
function EmploymentTerms({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeCollection(
    `/v1/employment/assignments/${assignmentId}/terms`,
    EmploymentTermPageSchema,
  );
  return (
    <NativePanel
      title="termHistory"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((term) => (
        <div key={term.id} className="cq-list-item">
          <NativeFacts
            values={{
              effectiveFrom: term.effectiveFrom,
              effectiveTo: term.effectiveTo,
              organizationUnitId: term.organizationUnitId,
              supervisorId: term.supervisorId,
              workTimeModelId: term.workTimeModelId,
              weeklyHours: term.weeklyHours,
              dailyTargetHours: term.dailyTargetHours,
              workingDays: term.workingDays,
              employmentGroupId: term.employmentGroupId,
              holidayCalendarId: term.holidayCalendarId,
            }}
          />
        </div>
      ))}
      <details>
        <summary>{t('appendTerms')}</summary>
        <p>{t('futureTerms')}</p>
        <NativeForm
          path={`/v1/employment/assignments/${assignmentId}/terms`}
          fields={termFields}
          inputSchema={CreateEmploymentTermSchema}
          responseSchema={EmploymentTermSchema}
          after={resource.load}
        />
      </details>
    </NativePanel>
  );
}
