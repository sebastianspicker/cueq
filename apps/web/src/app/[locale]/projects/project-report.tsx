'use client';

import { useState } from 'react';
import { ProjectReportTotals } from './project-report-totals';
import { useTranslations } from 'next-intl';
import { ProjectReportQuerySchema, ProjectReportSchema } from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { StatusBanner } from '../../../components/StatusBanner';
import { NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeResource } from '../../../shared/native-hr/use-native-resource';
import { useNativeDownload } from '../../../shared/native-hr/use-native-download';
import { localDateTimeInputToIsoInstant } from '../../../shared/time/datetime-local';

export function ProjectReporting({ projectId }: { projectId: string }) {
  const t = useTranslations('pages.nativeHr');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <h3>{t('projectReport')}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = ProjectReportQuerySchema.safeParse({
            from: localDateTimeInputToIsoInstant(from),
            to: localDateTimeInputToIsoInstant(to),
          });
          setInvalid(!parsed.success);
          if (parsed.success) setQuery(new URLSearchParams(parsed.data).toString());
        }}
      >
        <div className="cq-grid-2">
          <FormField label={t('fields.from')}>
            <input
              type="datetime-local"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </FormField>
          <FormField label={t('fields.to')}>
            <input
              type="datetime-local"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </FormField>
        </div>
        <button type="submit">{t('runReport')}</button>
      </form>
      <StatusBanner error={invalid ? t('invalid') : null} />
      {query ? <ProjectReportResult key={query} projectId={projectId} query={query} /> : null}
    </>
  );
}
function ProjectReportResult({ projectId, query }: { projectId: string; query: string }) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeResource(
    `/v1/projects/${projectId}/report?${query}`,
    ProjectReportSchema,
  );
  const transfer = useNativeDownload();
  const report = resource.data;
  return (
    <NativePanel title="projectReport" phase={resource.phase} reload={resource.load}>
      {report ? (
        <>
          <ProjectReportTotals report={report} />
          <button
            type="button"
            disabled={transfer.loading}
            onClick={() =>
              void transfer.download(
                `/v1/projects/${projectId}/report.csv?${query}`,
                `project-${projectId}.csv`,
              )
            }
          >
            {t('downloadReport')}
          </button>
          <StatusBanner error={transfer.error} />
        </>
      ) : null}
    </NativePanel>
  );
}
