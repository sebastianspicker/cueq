import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';
import { PersonHelper } from './helpers/person.helper';
import { HR_LIKE_ROLES } from './helpers/role-constants';
import { TerminalGatewayService } from './terminal-gateway.service';

/**
 * Thin facade that forwards terminal-device operations to
 * {@link TerminalGatewayService} after an HR/Admin role check.
 *
 * All other domain logic has been extracted into dedicated services
 * (see services/ directory).
 */
@Injectable()
export class Phase2Service {
  constructor(
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(TerminalGatewayService) private readonly terminalGatewayService: TerminalGatewayService,
  ) {}

  async importTerminalBatch(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }

    const actor = await this.personHelper.personForUser(user);
    return this.terminalGatewayService.importBatch(user, actor.id, payload);
  }

  async importTerminalBatchFile(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }

    const actor = await this.personHelper.personForUser(user);
    return this.terminalGatewayService.importBatchFile(user, actor.id, payload);
  }

  async getTerminalBatch(user: AuthenticatedIdentity, batchId: string): Promise<unknown> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read terminal batches.');
    }
    return this.terminalGatewayService.getBatch(batchId);
  }
}
