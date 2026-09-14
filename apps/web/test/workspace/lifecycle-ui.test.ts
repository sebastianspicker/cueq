import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import {
  CreateLifecycleInstanceSchema,
  LifecycleDefinitionSchema,
  type LifecycleTask,
} from '@cueq/contracts';
import {
  newTemplateTask,
  renameTemplateTask,
  removeTemplateTask,
} from '../../src/app/[locale]/lifecycle/template-draft';
import { nativePayload } from '../../src/shared/native-hr/native-payload';
import { TaskCard } from '../../src/app/[locale]/tasks/task-card';
import { ApiProvider } from '../../src/platform/http/api-context';
import en from '../../src/messages/en.json';

const tasks = [
  { ...newTemplateTask([]), key: 'start', title: 'Start' },
  { ...newTemplateTask([]), key: 'finish', title: 'Finish', dependsOn: ['start'] },
];
describe('lifecycle draft and date semantics', () => {
  it('updates dependency references when renaming a task without mutating the old draft', () => {
    const next = renameTemplateTask(tasks, 0, 'prepare');
    expect(next[1]?.dependsOn).toEqual(['prepare']);
    expect(tasks[1]?.dependsOn).toEqual(['start']);
    expect(LifecycleDefinitionSchema.safeParse({ tasks: next }).success).toBe(true);
  });
  it('removes references to a removed task and generates unique new keys', () => {
    expect(removeTemplateTask(tasks, 0)[0]?.dependsOn).toEqual([]);
    expect(newTemplateTask([{ ...tasks[0]!, key: 'task-2' }]).key).toBe('task-3');
  });
  it('rejects a draft dependency cycle and duplicate keys before submission', () => {
    expect(
      LifecycleDefinitionSchema.safeParse({
        tasks: [{ ...tasks[0], dependsOn: ['finish'] }, tasks[1]],
      }).success,
    ).toBe(false);
    expect(
      LifecycleDefinitionSchema.safeParse({ tasks: renameTemplateTask(tasks, 0, 'finish') })
        .success,
    ).toBe(false);
  });
  it('keeps lifecycle base dates date-only and preserves explicit target appointment', () => {
    const id = `c${'a'.repeat(24)}`;
    const body = CreateLifecycleInstanceSchema.parse({
      templateId: id,
      personId: id,
      assignmentId: id,
      eventKey: 'synthetic-start',
      ...nativePayload([{ key: 'baseDate', type: 'date' }], { baseDate: '2027-03-28' }),
    });
    expect(body.baseDate).toBe('2027-03-28');
    expect(body.assignmentId).toBe(id);
  });
});

describe('task dependency UI', () => {
  function renderTask(blockedBy: string[], status: 'OPEN' | 'DONE') {
    const task: LifecycleTask = {
      id: 'synthetic',
      instanceId: 'synthetic',
      key: 'task',
      title: 'Synthetic task',
      description: '',
      responsiblePersonId: 'synthetic',
      responsibleGroupId: null,
      dependsOn: ['before'],
      blocking: true,
      dueDate: '2027-03-28',
      status,
      completedAt: null,
      completedById: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    };
    return renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: 'en',
        messages: en,
        timeZone: 'Europe/Berlin',
        children: createElement(ApiProvider, {
          children: createElement(TaskCard, { task, blockedBy, after: async () => {} }),
        }),
      }),
    );
  }
  it('shows blockers without offering completion for a blocked open task', () => {
    const html = renderTask(['before'], 'OPEN');
    expect(html).toContain('Waiting for prerequisite tasks');
    expect(html).not.toContain('Complete task');
    expect(html).toContain('2027-03-28');
  });
  it('offers completion only after prerequisites are clear and supports reopening completed tasks', () => {
    expect(renderTask([], 'OPEN')).toContain('Complete task');
    expect(renderTask([], 'DONE')).toContain('Reopen task');
  });
});
