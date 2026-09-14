'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PersonnelReconciliationResultSchema, ReconcilePersonnelCsvSchema } from '@cueq/contracts';
import { SectionCard } from '../../../components/SectionCard';
import { FormField } from '../../../components/FormField';
import { StatusBanner } from '../../../components/StatusBanner';
import { useNativeMutation } from '../../../shared/native-hr/use-native-resource';

export function CsvReconciliation({
  sourceId,
  after,
}: {
  sourceId: string;
  after: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const [csv, setCsv] = useState('');
  const [invalid, setInvalid] = useState(false);
  const generation = useRef(0);
  const mutation = useNativeMutation();
  return (
    <SectionCard>
      <h2>{t('csvTitle')}</h2>
      <p>{t('csvDescription')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = ReconcilePersonnelCsvSchema.safeParse({ csv });
          setInvalid(!parsed.success);
          if (parsed.success)
            void mutation.save(
              `/v1/hr/sources/${sourceId}/reconcile-csv`,
              parsed.data,
              PersonnelReconciliationResultSchema,
              after,
            );
        }}
      >
        <fieldset disabled={mutation.loading}>
          <FormField label={t('fields.csvFile')}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const current = ++generation.current;
                setCsv('');
                setInvalid(false);
                if (!file) return;
                if (file.size > 65536) {
                  setInvalid(true);
                  return;
                }
                void file
                  .text()
                  .then((text) => {
                    if (current === generation.current) setCsv(text);
                  })
                  .catch(() => {
                    if (current === generation.current) setInvalid(true);
                  });
              }}
            />
          </FormField>
          <FormField label={t('fields.csvPreview')} hint={t('csvPreviewHint')}>
            <textarea
              value={csv}
              rows={8}
              maxLength={65536}
              onChange={(event) => {
                generation.current += 1;
                setCsv(event.target.value);
              }}
              required
            />
          </FormField>
          <button type="submit" disabled={!csv}>
            {mutation.loading ? t('loading') : t('importCsv')}
          </button>
        </fieldset>
      </form>
      <StatusBanner message={mutation.message} error={invalid ? t('invalidCsv') : mutation.error} />
    </SectionCard>
  );
}
