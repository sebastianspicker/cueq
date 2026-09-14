'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreateHrSourceSchema,
  HrSourcePageSchema,
  HrSourceSchema,
  PersonnelFieldKeySchema,
} from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { HrSourceDetail } from './source-detail';
import { CapabilityGrants } from './capability-grants';

export default function HrAdminPage() {
  const t = useTranslations('pages.nativeHr');
  const [selected, setSelected] = useState<string | null>(null);
  const sources = useNativeCollection('/v1/hr/sources', HrSourcePageSchema);
  return (
    <PageShell title={t('hrTitle')} description={t('hrDescription')}>
      <NativePanel
        title="sources"
        phase={sources.phase}
        empty={!sources.data?.items.length}
        reload={sources.load}
        more={sources.data?.nextCursor ? sources.more : undefined}
      >
        <ul className="cq-list-stack">
          {sources.data?.items.map((source) => (
            <li key={source.id} className="cq-list-item">
              <button
                type="button"
                className="cq-btn-ghost"
                aria-pressed={selected === source.id}
                onClick={() => setSelected(source.id)}
              >
                {source.name}
              </button>
              <NativeFacts values={{ sourceSystem: source.id, code: source.code }} />
              <dl className="cq-kv-grid">
                {Object.entries(source.ownershipProfile).map(([key, owner]) => (
                  <div key={key}>
                    <dt>{t(`fields.${key}`)}</dt>
                    <dd>{t(`values.${owner}`)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <details>
          <summary>{t('createSource')}</summary>
          <NativeForm
            path="/v1/hr/sources"
            inputSchema={CreateHrSourceSchema}
            responseSchema={HrSourceSchema}
            fields={[
              { key: 'code' },
              { key: 'name' },
              ...PersonnelFieldKeySchema.options.map((key) => ({
                key: `ownershipProfile.${key}`,
                options: ['CUEQ', 'SOURCE'],
              })),
            ]}
            after={sources.load}
          />
        </details>
      </NativePanel>
      {sources.phase === 'ready' &&
      selected &&
      sources.data?.items.some((item) => item.id === selected) ? (
        <HrSourceDetail key={selected} sourceId={selected} />
      ) : null}
      <CapabilityGrants />
    </PageShell>
  );
}
