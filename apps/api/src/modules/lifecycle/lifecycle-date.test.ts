import { describe, expect, it } from 'vitest';
import { addLifecycleDays, lifecycleDateString, lifecycleToday } from './lifecycle-date.js';
import { orderedLifecycleTasks } from './lifecycle-definition.js';

describe('lifecycle date and dependency helpers', () => {
  it('uses date-only arithmetic across Berlin DST boundaries', () => {
    const beforeSpringChange = new Date('2026-03-28T00:00:00.000Z');
    const beforeAutumnChange = new Date('2026-10-24T00:00:00.000Z');

    expect(lifecycleDateString(addLifecycleDays(beforeSpringChange, 2))).toBe('2026-03-30');
    expect(lifecycleDateString(addLifecycleDays(beforeAutumnChange, 2))).toBe('2026-10-26');
  });

  it('uses the Berlin calendar day at UTC and DST boundaries', () => {
    expect(lifecycleDateString(lifecycleToday(new Date('2026-03-29T22:30:00Z')))).toBe(
      '2026-03-30',
    );
    expect(lifecycleDateString(lifecycleToday(new Date('2026-10-25T23:30:00Z')))).toBe(
      '2026-10-26',
    );
  });

  it('orders tasks after all dependencies while preserving stable peers', () => {
    const tasks = orderedLifecycleTasks({
      tasks: [
        {
          key: 'access',
          title: 'Access',
          description: '',
          responsibleKind: 'SUBJECT',
          responsibleId: null,
          dueOffsetDays: 0,
          dependsOn: ['contract'],
          blocking: false,
        },
        {
          key: 'contract',
          title: 'Contract',
          description: '',
          responsibleKind: 'SUBJECT',
          responsibleId: null,
          dueOffsetDays: -1,
          dependsOn: [],
          blocking: true,
        },
        {
          key: 'welcome',
          title: 'Welcome',
          description: '',
          responsibleKind: 'SUBJECT',
          responsibleId: null,
          dueOffsetDays: 1,
          dependsOn: ['access'],
          blocking: false,
        },
      ],
    });

    expect(tasks.map((task) => task.key)).toEqual(['contract', 'access', 'welcome']);
  });
});
