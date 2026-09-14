/** Pure task dependency ordering for immutable lifecycle snapshots. */
import type { LifecycleDefinitionSchema } from '@cueq/contracts';

export type LifecycleDefinition = ReturnType<typeof LifecycleDefinitionSchema.parse>;
type LifecycleTaskDefinition = LifecycleDefinition['tasks'][number];

export function orderedLifecycleTasks(definition: LifecycleDefinition) {
  const remaining = new Map(definition.tasks.map((task) => [task.key, task]));
  const ordered: LifecycleTaskDefinition[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((task) =>
      task.dependsOn.every((key) => ordered.some((candidate) => candidate.key === key)),
    );
    if (ready.length === 0) throw new Error('Lifecycle task dependencies contain a cycle.');
    for (const task of ready) {
      ordered.push(task);
      remaining.delete(task.key);
    }
  }
  return ordered;
}
