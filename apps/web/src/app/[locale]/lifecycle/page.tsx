'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreateLifecycleInstanceSchema,
  LifecycleInstanceDetailSchema,
  LifecycleInstancePageSchema,
} from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { FormField } from '../../../components/FormField';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import {
  useNativeCollection,
  useNativeResource,
} from '../../../shared/native-hr/use-native-resource';
import { LifecycleConfiguration, LifecycleTemplates } from './lifecycle-configuration';
import { TaskCard } from '../tasks/task-card';

export default function LifecyclePage() {
  const t = useTranslations('pages.nativeHr');
  const [personId, setPersonId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useNativeCollection(
    `/v1/lifecycle/instances${query}`,
    LifecycleInstancePageSchema,
  );
  return (
    <PageShell title={t('lifecycleTitle')} description={t('lifecycleDescription')}>
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
        title="instances"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        {resource.data?.items.map((instance) => (
          <div key={instance.id} className="cq-list-item">
            <button
              type="button"
              className="cq-btn-ghost"
              aria-pressed={selected === instance.id}
              onClick={() => setSelected(instance.id)}
            >
              {instance.snapshot.template.title}
            </button>
            <NativeFacts
              values={{
                personId: instance.personId,
                assignmentId: instance.assignmentId,
                baseDate: instance.baseDate,
                status: instance.status,
                eventKey: instance.eventKey,
              }}
            />
          </div>
        ))}
      </NativePanel>
      {resource.phase === 'ready' &&
      selected &&
      resource.data?.items.some((item) => item.id === selected) ? (
        <InstanceDetail key={selected} instanceId={selected} />
      ) : null}
      <SectionCard>
        <details>
          <summary>{t('startLifecycle')}</summary>
          <NativeForm
            path="/v1/lifecycle/instances"
            inputSchema={CreateLifecycleInstanceSchema}
            responseSchema={LifecycleInstanceDetailSchema}
            fields={[
              { key: 'templateId' },
              { key: 'personId' },
              { key: 'assignmentId' },
              { key: 'eventKey' },
              { key: 'baseDate', type: 'date' },
            ]}
            after={resource.load}
          />
        </details>
      </SectionCard>
      <LifecycleTemplates />
      <LifecycleConfiguration />
    </PageShell>
  );
}
function InstanceDetail({ instanceId }: { instanceId: string }) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeResource(
    `/v1/lifecycle/instances/${instanceId}`,
    LifecycleInstanceDetailSchema,
  );
  const completed = new Set(
    resource.data?.tasks.filter((task) => task.status === 'DONE').map((task) => task.key),
  );
  return (
    <NativePanel title="instanceDetail" phase={resource.phase} reload={resource.load}>
      {resource.data ? (
        <>
          <h3>{resource.data.snapshot.template.title}</h3>
          <p>{t('immutableSnapshot')}</p>
          <p>{t('completionRule')}</p>
          <NativeFacts
            values={{
              version: resource.data.snapshot.template.version,
              lifecycleKind: resource.data.snapshot.template.kind,
              personId: resource.data.personId,
              assignmentId: resource.data.assignmentId,
              baseDate: resource.data.baseDate,
              status: resource.data.status,
            }}
          />
          {resource.data.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              blockedBy={task.dependsOn.filter((key) => !completed.has(key))}
              after={resource.load}
            />
          ))}
        </>
      ) : null}
    </NativePanel>
  );
}
