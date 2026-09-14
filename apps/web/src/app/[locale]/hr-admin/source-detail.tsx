'use client';

import { useTranslations } from 'next-intl';
import {
  PersonnelFieldKeySchema,
  PersonnelOutboundChangePageSchema,
  PersonnelReconciliationResultSchema,
  ReconcilePersonnelRecordSchema,
  ReconcilePersonnelSchema,
} from '@cueq/contracts';
import { SectionCard } from '../../../components/SectionCard';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { CsvReconciliation } from './source-csv';

const SingleRecordSchema = {
  parse: (input: unknown) =>
    ReconcilePersonnelSchema.parse({ records: [ReconcilePersonnelRecordSchema.parse(input)] }),
};
export function HrSourceDetail({ sourceId }: { sourceId: string }) {
  const t = useTranslations('pages.nativeHr');
  const outbound = useNativeCollection(
    `/v1/hr/sources/${sourceId}/outbound-changes`,
    PersonnelOutboundChangePageSchema,
  );
  return (
    <>
      <SectionCard>
        <h2>{t('reconcile')}</h2>
        <p>{t('reconcileDescription')}</p>
        <NativeForm
          key={sourceId}
          path={`/v1/hr/sources/${sourceId}/reconcile`}
          inputSchema={SingleRecordSchema}
          responseSchema={PersonnelReconciliationResultSchema}
          fields={[
            { key: 'personId' },
            { key: 'externalRecordId' },
            { key: 'expectedSourceRevision', nullable: true },
            { key: 'revision' },
            ...PersonnelFieldKeySchema.options.map((key) => ({
              key: `fields.${key}`,
              optional: true,
            })),
          ]}
          submitLabel="reconcile"
          after={outbound.load}
        />
      </SectionCard>
      <CsvReconciliation sourceId={sourceId} after={outbound.load} />
      <NativePanel
        title="outbound"
        phase={outbound.phase}
        empty={!outbound.data?.items.length}
        reload={outbound.load}
        more={outbound.data?.nextCursor ? outbound.more : undefined}
      >
        {outbound.data?.items.map((item) => (
          <div key={item.id} className="cq-list-item">
            <strong>{t(`values.${item.status}`)}</strong>
            <NativeFacts
              values={{
                personId: item.request.personId,
                fieldKey: item.request.fieldKey,
                requestedValue: item.request.requestedValue,
                expectedRevision: item.request.expectedRevision,
                acknowledgedRevision: item.acknowledgedRevision,
              }}
            />
          </div>
        ))}
      </NativePanel>
    </>
  );
}
