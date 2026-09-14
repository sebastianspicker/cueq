'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CompleteLifecycleTaskSchema,
  LifecycleTaskHistoryPageSchema,
  LifecycleTaskSchema,
  type LifecycleTask,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

export function TaskCard({
  task,
  blockedBy = [],
  after,
}: {
  task: LifecycleTask;
  blockedBy?: string[];
  after: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const [history, setHistory] = useState(false);
  return (
    <div className="cq-list-item">
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <NativeFacts
        values={{
          status: task.status,
          dueDate: task.dueDate,
          responsiblePersonId: task.responsiblePersonId,
          responsibleGroupId: task.responsibleGroupId,
          blocking: task.blocking,
          completedAt: task.completedAt,
        }}
      />
      {blockedBy.length > 0 ? (
        <p role="status">
          {t('taskBlocked')}: {blockedBy.join(', ')}
        </p>
      ) : null}
      {task.status === 'DONE' || blockedBy.length === 0 ? (
        <details>
          <summary>{task.status === 'DONE' ? t('reopenTask') : t('completeTask')}</summary>
          <NativeForm
            path={`/v1/lifecycle/tasks/${task.id}/complete`}
            inputSchema={CompleteLifecycleTaskSchema}
            responseSchema={LifecycleTaskSchema}
            fields={[{ key: 'reason', type: 'textarea' }]}
            defaults={{ status: task.status === 'DONE' ? 'OPEN' : 'DONE' }}
            after={after}
            submitLabel={task.status === 'DONE' ? 'reopenTask' : 'completeTask'}
          />
        </details>
      ) : null}
      <button
        type="button"
        className="cq-btn-ghost"
        aria-expanded={history}
        onClick={() => setHistory((value) => !value)}
      >
        {t('taskHistory')}
      </button>
      {history ? <TaskHistory taskId={task.id} /> : null}
    </div>
  );
}
function TaskHistory({ taskId }: { taskId: string }) {
  const resource = useNativeCollection(
    `/v1/lifecycle/tasks/${taskId}/history`,
    LifecycleTaskHistoryPageSchema,
  );
  return (
    <NativePanel
      title="taskHistory"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((entry) => (
        <NativeFacts
          key={entry.id}
          values={{
            action: entry.action,
            actorId: entry.actorId,
            reason: entry.reason,
            createdAt: entry.createdAt,
          }}
        />
      ))}
    </NativePanel>
  );
}
