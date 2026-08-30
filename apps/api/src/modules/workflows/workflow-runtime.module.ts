/** Narrow provider boundary for workflow runtime capabilities consumed by other features. */
import { Module } from '@nestjs/common';
import { WORKFLOW_RUNTIME_PORT } from '../../application/ports/workflow-runtime.port.js';
import { WorkflowAssignmentHelper } from './workflow-assignment.helper.js';
import { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

/**
 * Owns the workflow runtime port without importing workflow-effect owners.
 *
 * Feature modules may consume this module to create workflow assignments without
 * coupling themselves to the workflows HTTP and decision composition boundary.
 */
@Module({
  providers: [
    WorkflowAssignmentHelper,
    WorkflowDelegationCrudHelper,
    WorkflowRuntimeService,
    { provide: WORKFLOW_RUNTIME_PORT, useExisting: WorkflowRuntimeService },
  ],
  exports: [WORKFLOW_RUNTIME_PORT, WorkflowRuntimeService, WorkflowDelegationCrudHelper],
})
export class WorkflowRuntimeModule {}
