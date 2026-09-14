'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreateLifecycleTemplateSchema,
  LifecycleTemplateSchema,
  type LifecycleTemplate,
} from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { StatusBanner } from '../../../components/StatusBanner';
import { useNativeMutation } from '../../../shared/native-hr/use-native-resource';
import {
  newTemplateTask,
  renameTemplateTask,
  removeTemplateTask,
  type TemplateTaskDraft,
} from './template-draft';

export function TemplateEditor({
  template,
  after,
}: {
  template?: LifecycleTemplate;
  after: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const [code, setCode] = useState(template?.code ?? '');
  const [title, setTitle] = useState(template?.title ?? '');
  const [version, setVersion] = useState(String(template?.version ?? 1));
  const [kind, setKind] = useState(template?.kind ?? 'ONBOARDING');
  const [tasks, setTasks] = useState<TemplateTaskDraft[]>(
    () => template?.definition.tasks ?? [newTemplateTask([])],
  );
  const [invalid, setInvalid] = useState(false);
  const mutation = useNativeMutation();
  const update = (index: number, value: Partial<TemplateTaskDraft>) =>
    setTasks((old) =>
      old.map((task, position) => (position === index ? { ...task, ...value } : task)),
    );
  return (
    <form
      className="cq-native-form"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = CreateLifecycleTemplateSchema.safeParse({
          code,
          title,
          version: Number(version),
          kind,
          definition: { tasks },
        });
        setInvalid(!parsed.success);
        if (parsed.success)
          void mutation.send(
            template ? `/v1/lifecycle/templates/${template.id}` : '/v1/lifecycle/templates',
            { method: template ? 'PATCH' : 'POST', body: JSON.stringify(parsed.data) },
            LifecycleTemplateSchema,
            after,
          );
      }}
    >
      <p>{t('completionRule')}</p>
      <fieldset disabled={mutation.loading}>
        <div className="cq-grid-2">
          <FormField label={t('fields.code')}>
            <input value={code} required onChange={(event) => setCode(event.target.value)} />
          </FormField>
          <FormField label={t('fields.title')}>
            <input value={title} required onChange={(event) => setTitle(event.target.value)} />
          </FormField>
          <FormField label={t('fields.version')}>
            <input
              type="number"
              min={1}
              step={1}
              value={version}
              required
              onChange={(event) => setVersion(event.target.value)}
            />
          </FormField>
          <FormField label={t('fields.lifecycleKind')}>
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="ONBOARDING">{t('values.ONBOARDING')}</option>
              <option value="OFFBOARDING">{t('values.OFFBOARDING')}</option>
            </select>
          </FormField>
        </div>
        {tasks.map((task, index) => (
          <TaskEditor
            key={index}
            task={task}
            tasks={tasks}
            update={(value) => update(index, value)}
            rename={(key) => setTasks((old) => renameTemplateTask(old, index, key))}
            remove={() => setTasks((old) => removeTemplateTask(old, index))}
          />
        ))}
        <button
          type="button"
          disabled={tasks.length >= 100}
          onClick={() => setTasks((old) => [...old, newTemplateTask(old)])}
        >
          {t('addTask')}
        </button>
        <button type="submit">{mutation.loading ? t('loading') : t('saveDraft')}</button>
      </fieldset>
      <StatusBanner
        message={mutation.message}
        error={invalid ? t('invalidTemplate') : mutation.error}
      />
    </form>
  );
}
function TaskEditor({
  task,
  tasks,
  update,
  rename,
  remove,
}: {
  task: TemplateTaskDraft;
  tasks: TemplateTaskDraft[];
  update: (value: Partial<TemplateTaskDraft>) => void;
  rename: (key: string) => void;
  remove: () => void;
}) {
  const t = useTranslations('pages.nativeHr');
  return (
    <fieldset className="cq-list-item">
      <legend>{task.title || t('newTask')}</legend>
      <div className="cq-grid-2">
        <FormField label={t('fields.taskKey')}>
          <input value={task.key} required onChange={(event) => rename(event.target.value)} />
        </FormField>
        <FormField label={t('fields.title')}>
          <input
            value={task.title}
            required
            onChange={(event) => update({ title: event.target.value })}
          />
        </FormField>
        <FormField label={t('fields.description')}>
          <textarea
            value={task.description}
            onChange={(event) => update({ description: event.target.value })}
          />
        </FormField>
        <FormField label={t('fields.responsibleKind')}>
          <select
            value={task.responsibleKind}
            onChange={(event) =>
              update({
                responsibleKind: event.target.value as TemplateTaskDraft['responsibleKind'],
                responsibleId: event.target.value === 'SUBJECT' ? null : '',
              })
            }
          >
            {['SUBJECT', 'PERSON', 'GROUP'].map((value) => (
              <option key={value} value={value}>
                {t(`values.${value}`)}
              </option>
            ))}
          </select>
        </FormField>
        {task.responsibleKind !== 'SUBJECT' ? (
          <FormField label={t('fields.responsibleId')}>
            <input
              value={task.responsibleId ?? ''}
              required
              onChange={(event) => update({ responsibleId: event.target.value })}
            />
          </FormField>
        ) : null}
        <FormField label={t('fields.dueOffsetDays')}>
          <input
            type="number"
            min={-365}
            max={365}
            step={1}
            required
            value={task.dueOffsetDays}
            onChange={(event) => update({ dueOffsetDays: Number(event.target.value) })}
          />
        </FormField>
        <FormField label={t('fields.dependsOn')}>
          <select
            multiple
            value={task.dependsOn}
            onChange={(event) =>
              update({
                dependsOn: Array.from(event.target.selectedOptions, (option) => option.value),
              })
            }
          >
            {tasks
              .filter((other) => other !== task)
              .map((other, index) => (
                <option key={index} value={other.key}>
                  {other.title || other.key}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label={t('fields.blocking')}>
          <input
            type="checkbox"
            checked={task.blocking}
            onChange={(event) => update({ blocking: event.target.checked })}
          />
        </FormField>
      </div>
      <button type="button" disabled={tasks.length <= 1} onClick={remove}>
        {t('removeTask')}
      </button>
    </fieldset>
  );
}
