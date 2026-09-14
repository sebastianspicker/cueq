import { describe, expect, it } from 'vitest';
import { lifecycleTaskScope } from './lifecycle-scope.js';

describe('lifecycle task scope', () => {
  it('requires an explicit task capability alongside direct or current group responsibility', () => {
    const scope = lifecycleTaskScope('actor-1', 'tasks.complete');

    expect(scope.sql).toContain('capability_grants');
    expect(scope.sql).toContain('task_group_members');
    expect(scope.sql).toContain('gm."personId"');
    expect(scope.values).toContain('tasks.complete');
    expect(scope.values).toContain('lifecycle.manage');
  });
});
