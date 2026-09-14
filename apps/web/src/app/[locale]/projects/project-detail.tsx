'use client';

import { useTranslations } from 'next-intl';
import {
  CreateProjectMembershipSchema,
  ProjectArchiveSchema,
  ProjectMembershipPageSchema,
  ProjectMembershipSchema,
  ProjectSchema,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import {
  useNativeCollection,
  useNativeResource,
} from '../../../shared/native-hr/use-native-resource';
import { ProjectReporting } from './project-report';

const EmptyBodySchema = { parse: () => ({}) };
export function ProjectDetail({
  projectId,
  after,
}: {
  projectId: string;
  after: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeResource(`/v1/projects/${projectId}`, ProjectSchema);
  return (
    <NativePanel title="projectDetail" phase={resource.phase} reload={resource.load}>
      {resource.data ? (
        <>
          <h3>{resource.data.name}</h3>
          <NativeFacts
            values={{
              projectId: resource.data.id,
              parentId: resource.data.parentId,
              organizationUnitId: resource.data.organizationUnitId,
              managerId: resource.data.managerId,
              costCentre: resource.data.costCentre,
              fundingReference: resource.data.fundingReference,
              budgetHours: resource.data.budgetHours,
              archivedAt: resource.data.archivedAt,
            }}
          />
          {!resource.data.archivedAt ? (
            <details>
              <summary>{t('archiveProject')}</summary>
              <NativeForm
                path={`/v1/projects/${projectId}/archive`}
                fields={[]}
                inputSchema={EmptyBodySchema}
                responseSchema={ProjectArchiveSchema}
                after={after}
                submitLabel="archiveProject"
              />
            </details>
          ) : null}
          <ProjectMemberships projectId={projectId} archived={resource.data.archivedAt !== null} />
          <ProjectReporting projectId={projectId} />
        </>
      ) : null}
    </NativePanel>
  );
}
function ProjectMemberships({ projectId, archived }: { projectId: string; archived: boolean }) {
  const t = useTranslations('pages.nativeHr');
  const resource = useNativeCollection(
    `/v1/projects/${projectId}/memberships`,
    ProjectMembershipPageSchema,
  );
  return (
    <NativePanel
      title="memberships"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((member) => (
        <div key={member.id} className="cq-list-item">
          <NativeFacts
            values={{
              personId: member.personId,
              assignmentId: member.assignmentId,
              effectiveFrom: member.effectiveFrom,
              effectiveTo: member.effectiveTo,
            }}
          />
          {!archived && (!member.effectiveTo || Date.parse(member.effectiveTo) > Date.now()) ? (
            <NativeForm
              path={`/v1/projects/${projectId}/memberships/${member.id}/end`}
              fields={[]}
              inputSchema={EmptyBodySchema}
              responseSchema={ProjectMembershipSchema}
              after={resource.load}
              submitLabel="endMembership"
            />
          ) : null}
        </div>
      ))}
      {!archived ? (
        <details>
          <summary>{t('addMembership')}</summary>
          <NativeForm
            path={`/v1/projects/${projectId}/memberships`}
            fields={[
              { key: 'personId' },
              { key: 'assignmentId' },
              { key: 'effectiveFrom', type: 'datetime-local' },
              { key: 'effectiveTo', type: 'datetime-local', nullable: true },
            ]}
            inputSchema={CreateProjectMembershipSchema}
            responseSchema={ProjectMembershipSchema}
            after={resource.load}
          />
        </details>
      ) : null}
    </NativePanel>
  );
}
