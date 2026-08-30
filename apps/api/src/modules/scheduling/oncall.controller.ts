/** Exposes authorized on-call planning endpoints. */
import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import {
  CreateOnCallRotationSchema,
  UpdateOnCallRotationSchema,
  ListOnCallRotationsQuerySchema,
  CreateOnCallDeploymentSchema,
  ListOnCallDeploymentsQuerySchema,
  OnCallComplianceQuerySchema,
} from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { OncallDomainService } from './oncall-domain.service.js';

/** HTTP boundary for on-call planning; domain writes observe organization and closing constraints. */
@ApiTags('oncall')
@ApiBearerAuth()
@Controller('v1/oncall')
export class OncallController {
  constructor(
    @Inject(OncallDomainService) private readonly oncallDomainService: OncallDomainService,
  ) {}

  @Post('rotations')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Create on-call rotation entry' })
  createRotation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateOnCallRotationSchema)) payload: unknown,
  ) {
    return this.oncallDomainService.createOnCallRotation(user, payload);
  }

  @Get('rotations')
  @Authenticated()
  @ApiOperation({ summary: 'List on-call rotations' })
  listRotations(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(ListOnCallRotationsQuerySchema))
    query: Record<string, string | undefined>,
  ) {
    return this.oncallDomainService.listOnCallRotations(user, query);
  }

  @Patch('rotations/:id')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update on-call rotation entry' })
  updateRotation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rotationId: string,
    @Body(new ZodValidationPipe(UpdateOnCallRotationSchema)) payload: unknown,
  ) {
    return this.oncallDomainService.updateOnCallRotation(user, rotationId, payload);
  }

  @Post('deployments')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Create on-call deployment entry' })
  createDeployment(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateOnCallDeploymentSchema)) payload: unknown,
  ) {
    return this.oncallDomainService.createOnCallDeployment(user, payload);
  }

  @Get('deployments')
  @Authenticated()
  @ApiOperation({ summary: 'List on-call deployments' })
  listDeployments(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(ListOnCallDeploymentsQuerySchema))
    query: Record<string, string | undefined>,
  ) {
    return this.oncallDomainService.listOnCallDeployments(user, query);
  }

  @Get('compliance')
  @Authenticated()
  @ApiOperation({ summary: 'Evaluate on-call rest compliance' })
  compliance(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(OnCallComplianceQuerySchema))
    query: { personId?: string; nextShiftStart?: string },
  ) {
    return this.oncallDomainService.onCallCompliance(user, query.personId, query.nextShiftStart);
  }
}
