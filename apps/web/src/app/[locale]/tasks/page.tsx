'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LifecycleTaskInboxPageSchema } from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { FormField } from '../../../components/FormField';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { TaskCard } from './task-card';

export default function TasksPage() {
  const t = useTranslations('pages.nativeHr');
  const session = useOptionalSessionContext();
  const [status, setStatus] = useState('OPEN');
  const [ownAppointment, setOwnAppointment] = useState(false);
  const query = new URLSearchParams({ status });
  if (ownAppointment && session?.assignmentId) query.set('assignmentId', session.assignmentId);
  const resource = useNativeCollection(
    `/v1/lifecycle/tasks/inbox?${query}`,
    LifecycleTaskInboxPageSchema,
  );
  return (
    <PageShell title={t('tasksTitle')} description={t('tasksDescription')}>
      <div className="cq-grid-2">
        <FormField label={t('fields.status')}>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">{t('values.OPEN')}</option>
            <option value="DONE">{t('values.DONE')}</option>
          </select>
        </FormField>
        <FormField label={t('selectedAppointmentOnly')}>
          <input
            type="checkbox"
            checked={ownAppointment}
            disabled={!session?.assignmentId}
            onChange={(event) => setOwnAppointment(event.target.checked)}
          />
        </FormField>
      </div>
      <NativePanel
        title="taskInbox"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        {resource.data?.items.map((task) => (
          <div key={task.id}>
            <NativeFacts values={{ personId: task.personId, assignmentId: task.assignmentId }} />
            <TaskCard task={task} blockedBy={task.blockedBy} after={resource.load} />
          </div>
        ))}
      </NativePanel>
    </PageShell>
  );
}
