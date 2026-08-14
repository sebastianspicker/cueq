/** Owns authorized on-call planning reads and closing-aware mutations. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { AuditHelper } from '../helpers/audit.helper.js';
import { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import {
  createOnCallDeploymentCommand,
  createOnCallRotationCommand,
  updateOnCallRotationCommand,
} from './oncall-commands.js';
import { listOnCallDeployments, listOnCallRotations, onCallCompliance } from './oncall-queries.js';

/**
 * Provides on-call planning operations while enforcing organization scope, closing barriers, and audit history.
 */
@Injectable()
export class OncallDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  private commandDependencies() {
    return {
      prisma: this.prisma,
      personHelper: this.personHelper,
      auditHelper: this.auditHelper,
      closingLockHelper: this.closingLockHelper,
    };
  }

  async createOnCallRotation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return createOnCallRotationCommand(this.commandDependencies(), user, payload);
  }

  async listOnCallRotations(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    return listOnCallRotations(this.prisma, user, actor, query);
  }

  async listOnCallDeployments(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    return listOnCallDeployments(this.prisma, user, actor, query);
  }

  async updateOnCallRotation(
    user: AuthenticatedIdentity,
    rotationId: string,
    payload: unknown,
  ): Promise<unknown> {
    return updateOnCallRotationCommand(this.commandDependencies(), user, rotationId, payload);
  }

  async createOnCallDeployment(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return createOnCallDeploymentCommand(this.commandDependencies(), user, payload);
  }

  async onCallCompliance(
    user: AuthenticatedIdentity,
    personId?: string,
    nextShiftStart?: string,
  ): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    return onCallCompliance(this.prisma, user, actor, personId, nextShiftStart);
  }
}
