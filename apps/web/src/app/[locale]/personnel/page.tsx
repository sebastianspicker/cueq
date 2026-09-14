'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PersonnelDirectoryPageSchema } from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { FormField } from '../../../components/FormField';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { NativePanel } from '../../../shared/native-hr/native-panels';
import { PersonnelProfilePanel } from './personnel-profile';
import { PersonnelOrganizations } from './personnel-organizations';
import { OrganizationPicker } from '../../../shared/native-hr/organization-picker';
import { ProfileChangesPanel } from './profile-changes';

export default function PersonnelPage() {
  const t = useTranslations('pages.nativeHr');
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('');
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState('me');
  const directory = useNativeCollection(`/v1/personnel${query}`, PersonnelDirectoryPageSchema);
  return (
    <PageShell title={t('personnelTitle')} description={t('personnelDescription')}>
      <button type="button" onClick={() => setPersonId('me')}>
        {t('myProfile')}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();
          if (search) params.set('search', search);
          if (unit) params.set('organizationUnitId', unit);
          setQuery(`?${params}`);
          setPersonId('me');
        }}
      >
        <div className="cq-grid-2">
          <FormField label={t('fields.search')}>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <OrganizationPicker value={unit} onChange={setUnit} />
        </div>
        <button type="submit">{t('search')}</button>
      </form>
      <NativePanel
        title="directory"
        phase={directory.phase}
        empty={!directory.data?.items.length}
        reload={directory.load}
        more={directory.data?.nextCursor ? directory.more : undefined}
      >
        <ul className="cq-list-stack">
          {directory.data?.items.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="cq-btn-ghost"
                aria-pressed={personId === person.id}
                onClick={() => setPersonId(person.id)}
              >
                {person.firstName} {person.lastName}
              </button>
            </li>
          ))}
        </ul>
      </NativePanel>
      <PersonnelProfilePanel key={personId} personId={personId} />
      <ProfileChangesPanel />
      <PersonnelOrganizations />
    </PageShell>
  );
}
