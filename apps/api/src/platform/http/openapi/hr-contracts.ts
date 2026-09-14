/** Attaches shared native HR schemas to discovered routes without editing generated output. */
import * as contracts from '@cueq/contracts';
import type { OpenAPIObject } from '@nestjs/swagger';
import type {
  OperationObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface.js';
import { z } from 'zod';
import { zodOpenApiSchema } from './zod-schema.js';

type Route = [string, 'get' | 'post' | 'patch', string, string?, string?];
const ROUTES: Route[] = [
  ['/v1/time-accounts', 'get', 'TimeAccountPageSchema', undefined, 'TimeAccountQuerySchema'],
  [
    '/v1/time-accounts/{id}/split',
    'post',
    'SplitTimeAccountResultSchema',
    'SplitTimeAccountSchema',
  ],
  ['/v1/closing-periods/{id}/prepare-accounts', 'post', 'PrepareTimeAccountsResultSchema'],
  ['/v1/session/assignments', 'get', 'AssignmentOptionPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/personnel', 'get', 'PersonnelDirectoryPageSchema', undefined, 'PersonnelQuerySchema'],
  [
    '/v1/personnel/organizations',
    'get',
    'PersonnelOrganizationPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  ['/v1/personnel/me', 'get', 'PersonnelProfileSchema'],
  ['/v1/personnel/{id}', 'get', 'PersonnelProfileSchema'],
  [
    '/v1/personnel/changes',
    'get',
    'ProfileChangePageSchema',
    undefined,
    'ProfileChangesQuerySchema',
  ],
  ['/v1/personnel/changes', 'post', 'ProfileChangeSchema', 'CreateProfileChangeSchema'],
  ['/v1/personnel/changes/{id}/review', 'post', 'ProfileChangeSchema', 'ReviewProfileChangeSchema'],
  [
    '/v1/personnel/{id}/relationships',
    'get',
    'PersonnelRelationshipPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/personnel/relationships',
    'post',
    'PersonnelRelationshipSchema',
    'CreatePersonnelRelationshipSchema',
  ],
  ['/v1/hr/capability-grants', 'get', 'CapabilityGrantPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/hr/capability-grants', 'post', 'CapabilityGrantSchema', 'CreateCapabilityGrantSchema'],
  ['/v1/hr/capability-grants/{id}/revoke', 'post', 'CapabilityGrantSchema'],
  ['/v1/hr/sources', 'get', 'HrSourcePageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/hr/sources', 'post', 'HrSourceSchema', 'CreateHrSourceSchema'],
  [
    '/v1/hr/sources/{id}/reconcile',
    'post',
    'PersonnelReconciliationResultSchema',
    'ReconcilePersonnelSchema',
  ],
  [
    '/v1/hr/sources/{id}/reconcile-csv',
    'post',
    'PersonnelReconciliationResultSchema',
    'ReconcilePersonnelCsvSchema',
  ],
  [
    '/v1/hr/sources/{id}/outbound-changes',
    'get',
    'PersonnelOutboundChangePageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/employment/assignments',
    'get',
    'EmploymentAssignmentPageSchema',
    undefined,
    'AssignmentQuerySchema',
  ],
  [
    '/v1/employment/assignments',
    'post',
    'EmploymentAssignmentRecordSchema',
    'CreateEmploymentAssignmentSchema',
  ],
  [
    '/v1/employment/assignments/{id}/terms',
    'get',
    'EmploymentTermPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/employment/assignments/{id}/terms',
    'post',
    'EmploymentTermSchema',
    'CreateEmploymentTermSchema',
  ],
  ['/v1/employment/groups', 'get', 'EmploymentGroupPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/employment/groups', 'post', 'EmploymentGroupSchema', 'CreateEmploymentGroupSchema'],
  ['/v1/employment/calendars', 'get', 'HolidayCalendarPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/employment/calendars', 'post', 'HolidayCalendarSchema', 'CreateHolidayCalendarSchema'],
  [
    '/v1/documents',
    'get',
    'PersonnelDocumentPageSchema',
    undefined,
    'PersonnelDocumentQuerySchema',
  ],
  ['/v1/documents', 'post', 'PersonnelDocumentSchema', 'CreatePersonnelDocumentSchema'],
  ['/v1/documents/{id}', 'get', 'PersonnelDocumentDetailSchema'],
  [
    '/v1/documents/{id}/versions',
    'get',
    'PersonnelDocumentVersionPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/documents/{id}/versions',
    'post',
    'PersonnelDocumentVersionSchema',
    undefined,
    'UploadDocumentVersionQuerySchema',
  ],
  [
    '/v1/documents/{id}/versions/{versionId}/acknowledgements',
    'post',
    'DocumentAcknowledgementSchema',
  ],
  ['/v1/projects', 'get', 'ProjectPageSchema', undefined, 'ProjectQuerySchema'],
  ['/v1/projects', 'post', 'ProjectSchema', 'CreateProjectSchema'],
  ['/v1/projects/{id}', 'get', 'ProjectSchema'],
  ['/v1/projects/{id}/archive', 'post', 'ProjectArchiveSchema'],
  [
    '/v1/projects/{id}/memberships',
    'get',
    'ProjectMembershipPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/projects/{id}/memberships',
    'post',
    'ProjectMembershipSchema',
    'CreateProjectMembershipSchema',
  ],
  ['/v1/projects/{id}/memberships/{membershipId}/end', 'post', 'ProjectMembershipSchema'],
  [
    '/v1/projects/time/allocations',
    'get',
    'ProjectAllocationPageSchema',
    undefined,
    'ProjectTimeQuerySchema',
  ],
  ['/v1/projects/time/allocations', 'post', 'ProjectAllocationSchema', 'AllocateProjectTimeSchema'],
  ['/v1/projects/time/allocations/{allocationId}/release', 'post', 'ProjectAllocationSchema'],
  [
    '/v1/projects/time/unallocated',
    'get',
    'UnallocatedBookingPageSchema',
    undefined,
    'ProjectTimeQuerySchema',
  ],
  ['/v1/projects/{id}/report', 'get', 'ProjectReportSchema', undefined, 'ProjectReportQuerySchema'],
  ['/v1/lifecycle/templates', 'get', 'LifecycleTemplatePageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/lifecycle/templates', 'post', 'LifecycleTemplateSchema', 'CreateLifecycleTemplateSchema'],
  ['/v1/lifecycle/groups', 'get', 'TaskGroupPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/lifecycle/groups', 'post', 'TaskGroupSchema', 'CreateTaskGroupSchema'],
  [
    '/v1/lifecycle/automation',
    'get',
    'LifecycleAutomationPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  [
    '/v1/lifecycle/automation',
    'post',
    'LifecycleAutomationSchema',
    'CreateLifecycleAutomationSchema',
  ],
  [
    '/v1/lifecycle/templates/{id}',
    'patch',
    'LifecycleTemplateSchema',
    'CreateLifecycleTemplateSchema',
  ],
  ['/v1/lifecycle/templates/{id}/activate', 'post', 'LifecycleTemplateSchema'],
  [
    '/v1/lifecycle/instances',
    'get',
    'LifecycleInstancePageSchema',
    undefined,
    'LifecycleInstanceQuerySchema',
  ],
  [
    '/v1/lifecycle/instances',
    'post',
    'LifecycleInstanceDetailSchema',
    'CreateLifecycleInstanceSchema',
  ],
  ['/v1/lifecycle/instances/{id}', 'get', 'LifecycleInstanceDetailSchema'],
  [
    '/v1/lifecycle/tasks/inbox',
    'get',
    'LifecycleTaskInboxPageSchema',
    undefined,
    'TaskInboxQuerySchema',
  ],
  [
    '/v1/lifecycle/tasks/{id}/complete',
    'post',
    'LifecycleTaskSchema',
    'CompleteLifecycleTaskSchema',
  ],
  [
    '/v1/lifecycle/tasks/{id}/history',
    'get',
    'LifecycleTaskHistoryPageSchema',
    undefined,
    'CursorQuerySchema',
  ],
  ['/v1/inbox', 'get', 'InboxNotificationPageSchema', undefined, 'CursorQuerySchema'],
  ['/v1/inbox/{id}/read', 'post', 'InboxNotificationSchema'],
];

export function applyHrOpenApiContracts(document: OpenAPIObject) {
  document.components ??= {};
  document.components.schemas ??= {};
  const schemas = document.components.schemas;
  function register(name: string) {
    const schema = (contracts as Record<string, unknown>)[name];
    if (!(schema instanceof z.ZodType)) throw new Error(`Missing shared contract ${name}`);
    const json = zodOpenApiSchema(schema);
    schemas[name] = json;
    return json;
  }
  const csv = document.paths['/v1/projects/{id}/report.csv']?.get;
  const binary = document.paths['/v1/documents/{id}/versions/{versionId}/content']?.get;
  if (!csv || !binary) throw new Error('Missing native download route');
  applyQuery(csv, register('ProjectReportQuerySchema'));
  csv.responses['200'] = {
    description: 'Privacy-suppressed project report',
    content: { 'text/csv': { schema: { type: 'string' } } },
  };
  binary.responses['200'] = {
    description: 'Authorized document content',
    content: Object.fromEntries(
      ['application/pdf', 'image/png', 'image/jpeg'].map((mime) => [
        mime,
        { schema: { type: 'string', format: 'binary' } },
      ]),
    ),
  };
  for (const [path, method, response, body, query] of ROUTES) {
    const operation = document.paths[path]?.[method];
    if (!operation) throw new Error(`Missing native HTTP route ${method} ${path}`);
    register(response);
    operation.responses[method === 'post' ? '201' : '200'] = {
      description: 'Validated response contract',
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${response}` } } },
    };
    if (body) {
      register(body);
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${body}` } } },
      };
    }
    if (query) applyQuery(operation, register(query));
  }
}

function applyQuery(operation: OperationObject, schema: SchemaObject) {
  const names = new Set(Object.keys(schema.properties ?? {}));
  operation.parameters = (operation.parameters ?? []).filter(
    (p) => '$ref' in p || p.in !== 'query' || !names.has(p.name),
  );
  for (const [name, value] of Object.entries(schema.properties ?? {}))
    operation.parameters.push({
      name,
      in: 'query',
      required: schema.required?.includes(name) ?? false,
      schema: value,
    });
}
