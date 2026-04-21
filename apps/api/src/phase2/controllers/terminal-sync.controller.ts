import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Phase2Service } from '../phase2.service';
import { TerminalSyncBatchSchema, TerminalSyncBatchFileSchema } from '../terminal-gateway.service';

@ApiTags('terminal-sync')
@ApiBearerAuth()
@Roles(Role.HR, Role.ADMIN)
@Controller('v1/terminal/sync/batches')
export class TerminalSyncController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Import terminal offline-sync batch (CSV adapter v0)' })
  importBatch(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(TerminalSyncBatchSchema)) payload: unknown,
  ) {
    return this.phase2Service.importTerminalBatch(user, payload);
  }

  @Post('file')
  @ApiOperation({ summary: 'Import terminal offline-sync file batch (HONEYWELL_CSV_V1)' })
  importBatchFile(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(TerminalSyncBatchFileSchema)) payload: unknown,
  ) {
    return this.phase2Service.importTerminalBatchFile(user, payload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get imported terminal batch by id' })
  getBatch(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) batchId: string,
  ): Promise<unknown> {
    return this.phase2Service.getTerminalBatch(user, batchId);
  }
}
