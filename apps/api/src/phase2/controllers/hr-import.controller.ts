import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { HrImportService } from '../hr-import.service';

function isFailedHrImportRun(result: unknown): result is { status: 'FAILED' } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'status' in result &&
    result.status === 'FAILED'
  );
}

@ApiTags('hr-import')
@Controller('v1/hr/import-runs')
export class HrImportController {
  constructor(@Inject(HrImportService) private readonly hrImportService: HrImportService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Run HR master data import (file/API, integration token required)' })
  @ApiBadRequestResponse({ description: 'CSV or pre-acceptance validation failed; no run created' })
  @ApiConflictResponse({
    description: 'Another import holds the advisory lock; retry with the same payload',
    schema: {
      example: {
        statusCode: 409,
        code: 'HR_IMPORT_IN_PROGRESS',
        message: 'Another HR import is already in progress.',
        retryable: true,
      },
    },
  })
  runImport(
    @Headers('x-integration-token') integrationToken: string | string[] | undefined,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.hrImportService.runImport(integrationToken, payload).then((result) => {
      if (isFailedHrImportRun(result)) {
        throw new UnprocessableEntityException({
          message: 'HR import failed.',
          ...result,
        });
      }

      return result;
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get HR import run by id (integration token required)' })
  getImportRun(
    @Headers('x-integration-token') integrationToken: string | string[] | undefined,
    @Param('id', ParseCuidPipe) runId: string,
  ): Promise<unknown> {
    return this.hrImportService.getRun(integrationToken, runId);
  }
}
