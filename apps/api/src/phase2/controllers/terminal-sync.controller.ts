/** Exposes HR/Admin terminal batch import and batch-result lookup endpoints. */
import { Body, Controller, ForbiddenException, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { HR_LIKE_ROLES } from '../helpers/role-constants.js';
import { TerminalGatewayService } from '../terminal-gateway.service.js';

/** HR/Admin boundary for importing offline terminal batches and reading their results. */
@ApiTags('terminal-sync')
@ApiBearerAuth()
@Roles(Role.HR, Role.ADMIN)
@Controller('v1/terminal/sync/batches')
export class TerminalSyncController {
  constructor(
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(TerminalGatewayService) private readonly terminalGatewayService: TerminalGatewayService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Import terminal offline-sync batch (CSV adapter v0)' })
  async importBatch(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    const actorId = await this.requireHrActor(user);
    return this.terminalGatewayService.importBatch(user, actorId, payload);
  }

  @Post('file')
  @ApiOperation({ summary: 'Import terminal offline-sync file batch (HONEYWELL_CSV_V1)' })
  async importBatchFile(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    const actorId = await this.requireHrActor(user);
    return this.terminalGatewayService.importBatchFile(user, actorId, payload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get imported terminal batch by id' })
  getBatch(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) batchId: string,
  ): Promise<unknown> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read terminal batches.');
    }
    return this.terminalGatewayService.getBatch(batchId);
  }

  private async requireHrActor(user: AuthenticatedIdentity): Promise<string> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }
    const actor = await this.personHelper.personForUser(user);
    return actor.id;
  }
}
