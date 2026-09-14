'use client';

import { useTranslations } from 'next-intl';
import { PersonnelOrganizationPageSchema } from '@cueq/contracts';
import { NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

export function PersonnelOrganizations() {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeCollection(
    '/v1/personnel/organizations',
    PersonnelOrganizationPageSchema,
  );
  const names = new Map(resource.data?.items.map((unit) => [unit.id, unit.name]));
  return (
    <NativePanel
      title="organizations"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      <ul className="cq-list-stack">
        {resource.data?.items.map((unit) => (
          <li key={unit.id} className="cq-list-item">
            <strong>{unit.name}</strong>
            <p>
              {t('fields.organizationUnitId')}: {unit.id}
            </p>
            {unit.parentId ? (
              <p>
                {t('fields.parentOrganization')}:{' '}
                {names.get(unit.parentId) ?? t('parentOrganizationUnloaded')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </NativePanel>
  );
}
