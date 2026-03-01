import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('terminal-sync')
@ApiBearerAuth()
@Controller('v1/terminal/sync/batches')
export class TerminalSyncController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Import terminal offline-sync batch (CSV adapter v0)' })
  importBatch(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.importTerminalBatch(user, payload);
  }

  @Post('file')
  @ApiOperation({ summary: 'Import terminal offline-sync file batch (HONEYWELL_CSV_V1)' })
  importBatchFile(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.importTerminalBatchFile(user, payload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get imported terminal batch by id' })
  getBatch(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') batchId: string,
  ): Promise<unknown> {
    return this.phase2Service.getTerminalBatch(user, batchId);
  }
}
