import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HrImportService } from '../hr-import.service';

@ApiTags('hr-import')
@Controller('v1/hr/import-runs')
export class HrImportController {
  constructor(@Inject(HrImportService) private readonly hrImportService: HrImportService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Run HR master data import (file/API, integration token required)' })
  runImport(
    @Headers('x-integration-token') integrationToken: string | undefined,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.hrImportService.runImport(integrationToken, payload);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get HR import run by id (integration token required)' })
  getImportRun(
    @Headers('x-integration-token') integrationToken: string | undefined,
    @Param('id') runId: string,
  ): Promise<unknown> {
    return this.hrImportService.getRun(integrationToken, runId);
  }
}
