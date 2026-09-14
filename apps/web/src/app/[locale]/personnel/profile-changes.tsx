'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ProfileChangePageSchema,
  ProfileChangeSchema,
  ProfileChangeStatusSchema,
  ReviewProfileChangeSchema,
} from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

export function ProfileChangesPanel() {
  const t = useTranslations('pages.nativeHr');
  const session = useOptionalSessionContext();
  const [status, setStatus] = useState('');
  const resource = useNativeCollection(
    `/v1/personnel/changes${status ? `?status=${status}` : ''}`,
    ProfileChangePageSchema,
  );
  return (
    <>
      <FormField label={t('fields.status')}>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('all')}</option>
          {ProfileChangeStatusSchema.options.map((option) => (
            <option key={option} value={option}>
              {t(`values.${option}`)}
            </option>
          ))}
        </select>
      </FormField>
      <NativePanel
        title="changeRequests"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        <ul className="cq-list-stack">
          {resource.data?.items.map((item) => (
            <li key={item.id} className="cq-list-item">
              <strong>
                {t(`fields.${item.fieldKey}`)} · {t(`values.${item.status}`)}
              </strong>
              <NativeFacts
                values={{
                  personId: item.personId,
                  requestedValue: item.requestedValue,
                  expectedRevision: item.expectedRevision,
                  reason: item.reason,
                }}
              />
              {item.status === 'CONFLICT' ? <p role="status">{t('conflict')}</p> : null}
              {item.status === 'PENDING_APPROVAL' && item.personId !== session?.profile?.id ? (
                <details>
                  <summary>{t('review')}</summary>
                  <NativeForm
                    path={`/v1/personnel/changes/${item.id}/review`}
                    inputSchema={ReviewProfileChangeSchema}
                    responseSchema={ProfileChangeSchema}
                    fields={[
                      { key: 'decision', options: ['APPROVE', 'REJECT'] },
                      { key: 'reason', type: 'textarea' },
                    ]}
                    after={resource.load}
                    submitLabel="review"
                  />
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </NativePanel>
    </>
  );
}
