'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreateProjectSchema, ProjectPageSchema, ProjectSchema } from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { FormField } from '../../../components/FormField';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { ProjectDetail } from './project-detail';
import { ProjectTime } from './project-time';

export default function ProjectsPage() {
  const t = useTranslations('pages.nativeHr');
  const session = useOptionalSessionContext();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useNativeCollection(`/v1/projects${query}`, ProjectPageSchema);
  return (
    <PageShell title={t('projectsTitle')} description={t('projectsDescription')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams({ archived: String(archived) });
          if (search) params.set('search', search);
          setQuery(`?${params}`);
          setSelected(null);
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
          <FormField label={t('fields.archived')}>
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
            />
          </FormField>
        </div>
        <button type="submit">{t('search')}</button>
      </form>
      <NativePanel
        title="projects"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        <ul className="cq-list-stack">
          {resource.data?.items.map((project) => (
            <li key={project.id} className="cq-list-item">
              <button
                type="button"
                className="cq-btn-ghost"
                aria-pressed={selected === project.id}
                onClick={() => setSelected(project.id)}
              >
                {project.code} · {project.name}
              </button>
              <NativeFacts
                values={{
                  projectId: project.id,
                  parentId: project.parentId,
                  organizationUnitId: project.organizationUnitId,
                  archivedAt: project.archivedAt,
                }}
              />
            </li>
          ))}
        </ul>
      </NativePanel>
      {resource.phase === 'ready' &&
      selected &&
      resource.data?.items.some((item) => item.id === selected) ? (
        <ProjectDetail key={selected} projectId={selected} after={resource.load} />
      ) : null}
      <SectionCard>
        <details>
          <summary>{t('createProject')}</summary>
          <NativeForm
            path="/v1/projects"
            inputSchema={CreateProjectSchema}
            responseSchema={ProjectSchema}
            fields={[
              { key: 'code' },
              { key: 'name' },
              { key: 'parentId', nullable: true },
              { key: 'organizationUnitId' },
              { key: 'managerId' },
              { key: 'costCentre', nullable: true },
              { key: 'fundingReference', nullable: true },
              { key: 'budgetHours', type: 'number', nullable: true },
            ]}
            after={resource.load}
          />
        </details>
      </SectionCard>
      {session?.assignmentId ? (
        <ProjectTime
          key={`${session.assignmentId}:${selected ?? ''}`}
          assignmentId={session.assignmentId}
          projectId={selected}
        />
      ) : (
        <SectionCard>
          <p>{t('chooseAppointment')}</p>
        </SectionCard>
      )}
    </PageShell>
  );
}
