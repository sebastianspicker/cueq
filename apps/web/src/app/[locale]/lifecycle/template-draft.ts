import type { CreateLifecycleTemplateSchema } from '@cueq/contracts';
export type TemplateTaskDraft = ReturnType<
  typeof CreateLifecycleTemplateSchema.parse
>['definition']['tasks'][number];
export function newTemplateTask(tasks: TemplateTaskDraft[]): TemplateTaskDraft {
  let number = tasks.length + 1;
  while (tasks.some((task) => task.key === `task-${number}`)) number += 1;
  return {
    key: `task-${number}`,
    title: '',
    description: '',
    responsibleKind: 'SUBJECT',
    responsibleId: null,
    dueOffsetDays: 0,
    dependsOn: [],
    blocking: false,
  };
}
export function renameTemplateTask(tasks: TemplateTaskDraft[], index: number, key: string) {
  const oldKey = tasks[index]?.key;
  return tasks.map((task, position) => ({
    ...task,
    key: position === index ? key : task.key,
    dependsOn: task.dependsOn.map((dependency) => (dependency === oldKey ? key : dependency)),
  }));
}
export function removeTemplateTask(tasks: TemplateTaskDraft[], index: number) {
  const key = tasks[index]?.key;
  return tasks
    .filter((_task, position) => position !== index)
    .map((task) => ({
      ...task,
      dependsOn: task.dependsOn.filter((dependency) => dependency !== key),
    }));
}
