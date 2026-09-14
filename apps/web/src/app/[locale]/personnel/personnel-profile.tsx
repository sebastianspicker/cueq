'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreatePersonnelRelationshipSchema,
  CreateProfileChangeSchema,
  PersonnelFieldKeySchema,
  PersonnelProfileSchema,
  PersonnelRelationshipPageSchema,
  PersonnelRelationshipSchema,
  ProfileChangeSchema,
} from '@cueq/contracts';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { FormField } from '../../../components/FormField';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import {
  useNativeCollection,
  useNativeResource,
} from '../../../shared/native-hr/use-native-resource';

export function PersonnelProfilePanel({ personId }: { personId: string }) {
  const t = useTranslations('pages.nativeHr');
  const session = useOptionalSessionContext();
  const resource = useNativeResource(`/v1/personnel/${personId}`, PersonnelProfileSchema);
  const [fieldKey, setFieldKey] = useState('preferredName');
  const profile = resource.data;
  const field = profile?.fields.find((entry) => entry.key === fieldKey);
  return (
    <NativePanel title="profile" phase={resource.phase} reload={resource.load}>
      {profile ? (
        <>
          <h3>
            {profile.firstName} {profile.lastName}
          </h3>
          <NativeFacts values={{ personId: profile.id }} />
          {profile.fields.length === 0 ? (
            <p>{t('empty')}</p>
          ) : (
            <dl className="cq-kv-grid">
              {profile.fields.map((entry) => (
                <div key={entry.key}>
                  <dt>{t(`fields.${entry.key}`)}</dt>
                  <dd>{entry.value}</dd>
                  <dd>
                    {t('fields.ownerSystemId')}: {entry.ownerSystemId ?? 'cueq'} ·{' '}
                    {t('fields.revision')}: {entry.revision}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {profile.id === session?.profile?.id ? (
            <details>
              <summary>{t('requestChange')}</summary>
              <FormField label={t('fields.fieldKey')}>
                <select value={fieldKey} onChange={(event) => setFieldKey(event.target.value)}>
                  {PersonnelFieldKeySchema.options.map((key) => (
                    <option key={key} value={key}>
                      {t(`fields.${key}`)}
                    </option>
                  ))}
                </select>
              </FormField>
              <NativeForm
                key={`${fieldKey}:${field?.revision ?? 0}`}
                path="/v1/personnel/changes"
                inputSchema={CreateProfileChangeSchema}
                responseSchema={ProfileChangeSchema}
                fields={[{ key: 'requestedValue', type: 'textarea' }]}
                defaults={{ fieldKey, expectedRevision: field?.revision ?? 0 }}
                after={resource.load}
                submitLabel="requestChange"
              />
            </details>
          ) : null}
          <Relationships key={profile.id} personId={profile.id} />
        </>
      ) : null}
    </NativePanel>
  );
}
function Relationships({ personId }: { personId: string }) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeCollection(
    `/v1/personnel/${personId}/relationships`,
    PersonnelRelationshipPageSchema,
  );
  return (
    <NativePanel
      title="relationships"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((item) => (
        <NativeFacts
          key={item.id}
          values={{
            relatedPersonId: item.relatedPersonId,
            kind: item.kind,
            effectiveFrom: item.effectiveFrom,
            effectiveTo: item.effectiveTo,
          }}
        />
      ))}
      <details>
        <summary>{t('addRelationship')}</summary>
        <NativeForm
          path="/v1/personnel/relationships"
          inputSchema={CreatePersonnelRelationshipSchema}
          responseSchema={PersonnelRelationshipSchema}
          defaults={{ subjectPersonId: personId }}
          fields={[
            { key: 'relatedPersonId' },
            { key: 'kind', options: ['FUNCTIONAL_SUPERVISOR', 'PROJECT_CONTACT', 'MENTOR'] },
            { key: 'effectiveFrom', type: 'datetime-local' },
            { key: 'effectiveTo', type: 'datetime-local', nullable: true },
          ]}
          after={resource.load}
        />
      </details>
    </NativePanel>
  );
}
