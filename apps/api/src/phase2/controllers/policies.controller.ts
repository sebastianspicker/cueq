import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { PolicyBundleQuerySchema, PolicyHistoryQuerySchema } from '@cueq/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PolicyQueryService } from '../services/policy-query.service';

@ApiTags('policy')
@ApiBearerAuth()
@Controller('v1/policies')
@Roles(Role.HR, Role.ADMIN)
export class PoliciesController {
  constructor(
    @Inject(PolicyQueryService) private readonly policyQueryService: PolicyQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Resolve active policy bundle for a given date' })
  bundle(
    @Query(new ZodValidationPipe(PolicyBundleQuerySchema))
    query: Record<string, string | undefined>,
  ) {
    return this.policyQueryService.policyBundle(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'List policy catalog history entries' })
  history(
    @Query(new ZodValidationPipe(PolicyHistoryQuerySchema))
    query: Record<string, string | undefined>,
  ) {
    return this.policyQueryService.policyHistory(query);
  }
}
