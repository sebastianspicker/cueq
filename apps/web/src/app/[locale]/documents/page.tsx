'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreatePersonnelDocumentSchema,
  PersonnelDocumentPageSchema,
  PersonnelDocumentSchema,
} from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { FormField } from '../../../components/FormField';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { DocumentDetail } from './document-detail';

export default function DocumentsPage() {
  const t = useTranslations('pages.nativeHr');
  const [personId, setPersonId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useNativeCollection(`/v1/documents${query}`, PersonnelDocumentPageSchema);
  return (
    <PageShell title={t('documentsTitle')} description={t('documentsDescription')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();
          if (personId) params.set('personId', personId);
          if (assignmentId) params.set('assignmentId', assignmentId);
          setQuery(`?${params}`);
          setSelected(null);
        }}
      >
        <div className="cq-grid-2">
          <FormField label={t('fields.personId')}>
            <input value={personId} onChange={(event) => setPersonId(event.target.value)} />
          </FormField>
          <FormField label={t('fields.assignmentId')}>
            <input value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} />
          </FormField>
        </div>
        <button type="submit">{t('search')}</button>
      </form>
      <NativePanel
        title="documents"
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
                {item.title}
              </button>
              <NativeFacts
                values={{
                  personId: item.personId,
                  assignmentId: item.assignmentId,
                  expiresAt: item.expiresAt,
                  retainUntil: item.retainUntil,
                }}
              />
            </li>
          ))}
        </ul>
      </NativePanel>
      {resource.phase === 'ready' &&
      selected &&
      resource.data?.items.some((item) => item.id === selected) ? (
        <DocumentDetail key={selected} documentId={selected} />
      ) : null}
      <SectionCard>
        <details>
          <summary>{t('createDocument')}</summary>
          <NativeForm
            path="/v1/documents"
            inputSchema={CreatePersonnelDocumentSchema}
            responseSchema={PersonnelDocumentSchema}
            fields={[
              { key: 'personId' },
              { key: 'assignmentId' },
              { key: 'title' },
              { key: 'expiresAt', type: 'datetime-local', nullable: true },
              { key: 'retainUntil', type: 'datetime-local', nullable: true },
            ]}
            after={resource.load}
          />
        </details>
      </SectionCard>
    </PageShell>
  );
}
