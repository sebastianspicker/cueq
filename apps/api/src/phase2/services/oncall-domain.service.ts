import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { Phase2Service } from '../phase2.service';

@Injectable()
export class OncallDomainService {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  createOnCallRotation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createOnCallRotation(user, payload);
  }

  listOnCallRotations(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    return this.phase2Service.listOnCallRotations(user, query);
  }

  updateOnCallRotation(
    user: AuthenticatedIdentity,
    rotationId: string,
    payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.updateOnCallRotation(user, rotationId, payload);
  }

  createOnCallDeployment(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createOnCallDeployment(user, payload);
  }

  listOnCallDeployments(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    return this.phase2Service.listOnCallDeployments(user, query);
  }

  onCallCompliance(
    user: AuthenticatedIdentity,
    personId?: string,
    nextShiftStart?: string,
  ): Promise<unknown> {
    return this.phase2Service.onCallCompliance(user, personId, nextShiftStart);
  }
}
