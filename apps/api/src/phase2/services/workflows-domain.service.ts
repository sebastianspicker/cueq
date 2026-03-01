import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { Phase2Service } from '../phase2.service';

@Injectable()
export class WorkflowsDomainService {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createBookingCorrection(user, payload);
  }

  createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createShiftSwapWorkflow(user, payload);
  }

  createOvertimeApprovalWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createOvertimeApprovalWorkflow(user, payload);
  }

  workflowInbox(user: AuthenticatedIdentity, query?: unknown): Promise<unknown> {
    return this.phase2Service.workflowInbox(user, query);
  }

  listWorkflowPolicies(user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.listWorkflowPolicies(user);
  }

  upsertWorkflowPolicy(
    user: AuthenticatedIdentity,
    type: string,
    payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.upsertWorkflowPolicy(user, type, payload);
  }

  listWorkflowDelegations(
    user: AuthenticatedIdentity,
    query?: { delegatorId?: string; workflowType?: string },
  ): Promise<unknown> {
    return this.phase2Service.listWorkflowDelegations(user, query ?? {});
  }

  createWorkflowDelegation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createWorkflowDelegation(user, payload);
  }

  updateWorkflowDelegation(
    user: AuthenticatedIdentity,
    id: string,
    payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.updateWorkflowDelegation(user, id, payload);
  }

  deleteWorkflowDelegation(user: AuthenticatedIdentity, id: string): Promise<unknown> {
    return this.phase2Service.deleteWorkflowDelegation(user, id);
  }

  workflowDetail(user: AuthenticatedIdentity, workflowId: string): Promise<unknown> {
    return this.phase2Service.workflowDetail(user, workflowId);
  }

  decideWorkflow(
    user: AuthenticatedIdentity,
    workflowId: string,
    payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.decideWorkflow(user, workflowId, payload);
  }
}
