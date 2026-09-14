'use client';

import { useTranslations } from 'next-intl';
import {
  CreateLifecycleAutomationSchema,
  CreateTaskGroupSchema,
  LifecycleAutomationPageSchema,
  LifecycleAutomationSchema,
  LifecycleTemplatePageSchema,
  LifecycleTemplateSchema,
  TaskGroupPageSchema,
  TaskGroupSchema,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { TemplateEditor } from './template-editor';

const EmptyBodySchema = { parse: () => ({}) };
export function LifecycleTemplates() {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeCollection('/v1/lifecycle/templates', LifecycleTemplatePageSchema);
  return (
    <NativePanel
      title="templates"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((template) => (
        <div key={template.id} className="cq-list-item">
          <h3>{template.title}</h3>
          <NativeFacts
            values={{
              templateId: template.id,
              code: template.code,
              version: template.version,
              lifecycleKind: template.kind,
              status: template.status,
            }}
          />
          <ul>
            {template.definition.tasks.map((task) => (
              <li key={task.key}>
                {task.title} · {t('fields.dueOffsetDays')}: {task.dueOffsetDays}
              </li>
            ))}
          </ul>
          {template.status === 'DRAFT' ? (
            <>
              <details>
                <summary>{t('editDraft')}</summary>
                <TemplateEditor template={template} after={resource.load} />
              </details>
              <NativeForm
                fields={[]}
                path={`/v1/lifecycle/templates/${template.id}/activate`}
                inputSchema={EmptyBodySchema}
                responseSchema={LifecycleTemplateSchema}
                after={resource.load}
                submitLabel="activateTemplate"
              />
            </>
          ) : null}
        </div>
      ))}
      <details>
        <summary>{t('createTemplate')}</summary>
        <TemplateEditor after={resource.load} />
      </details>
    </NativePanel>
  );
}
export function LifecycleConfiguration() {
  const t = useTranslations('pages.nativeHr');
  const groups = useNativeCollection('/v1/lifecycle/groups', TaskGroupPageSchema);
  const automation = useNativeCollection('/v1/lifecycle/automation', LifecycleAutomationPageSchema);
  return (
    <>
      <NativePanel
        title="taskGroups"
        phase={groups.phase}
        empty={!groups.data?.items.length}
        reload={groups.load}
        more={groups.data?.nextCursor ? groups.more : undefined}
      >
        {groups.data?.items.map((group) => (
          <NativeFacts
            key={group.id}
            values={{ groupId: group.id, name: group.name, personIds: group.personIds }}
          />
        ))}
        <details>
          <summary>{t('createGroup')}</summary>
          <NativeForm
            fields={[{ key: 'name' }, { key: 'personIds', type: 'list' }]}
            path="/v1/lifecycle/groups"
            inputSchema={CreateTaskGroupSchema}
            responseSchema={TaskGroupSchema}
            after={groups.load}
          />
        </details>
      </NativePanel>
      <NativePanel
        title="automation"
        phase={automation.phase}
        empty={!automation.data?.items.length}
        reload={automation.load}
        more={automation.data?.nextCursor ? automation.more : undefined}
      >
        {automation.data?.items.map((rule) => (
          <NativeFacts
            key={rule.id}
            values={{
              name: rule.name,
              templateId: rule.templateId,
              organizationUnitId: rule.organizationUnitId,
              trigger: rule.trigger,
              triggerDate: rule.triggerDate,
              offsetDays: rule.offsetDays,
              enabled: rule.enabled,
            }}
          />
        ))}
        <details>
          <summary>{t('createAutomation')}</summary>
          <p>{t('automationDescription')}</p>
          <NativeForm
            fields={[
              { key: 'name' },
              { key: 'templateId' },
              { key: 'organizationUnitId' },
              { key: 'trigger', options: ['APPOINTMENT_START', 'APPOINTMENT_END', 'DATE'] },
              { key: 'triggerDate', type: 'date', nullable: true },
              { key: 'offsetDays', type: 'number' },
              { key: 'conditions.employmentGroupId', optional: true },
              { key: 'conditions.sourceSystem', optional: true },
            ]}
            defaults={{ conditions: {} }}
            path="/v1/lifecycle/automation"
            inputSchema={CreateLifecycleAutomationSchema}
            responseSchema={LifecycleAutomationSchema}
            after={automation.load}
          />
        </details>
      </NativePanel>
    </>
  );
}
