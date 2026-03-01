import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OncallDomainService } from '../services/oncall-domain.service';

@ApiTags('oncall')
@ApiBearerAuth()
@Controller('v1/oncall')
export class OncallController {
  constructor(
    @Inject(OncallDomainService) private readonly oncallDomainService: OncallDomainService,
  ) {}

  @Post('rotations')
  @ApiOperation({ summary: 'Create on-call rotation entry' })
  createRotation(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.oncallDomainService.createOnCallRotation(user, payload);
  }

  @Get('rotations')
  @ApiOperation({ summary: 'List on-call rotations' })
  listRotations(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.oncallDomainService.listOnCallRotations(user, query);
  }

  @Patch('rotations/:id')
  @ApiOperation({ summary: 'Update on-call rotation entry' })
  updateRotation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rotationId: string,
    @Body() payload: unknown,
  ) {
    return this.oncallDomainService.updateOnCallRotation(user, rotationId, payload);
  }

  @Post('deployments')
  @ApiOperation({ summary: 'Create on-call deployment entry' })
  createDeployment(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.oncallDomainService.createOnCallDeployment(user, payload);
  }

  @Get('deployments')
  @ApiOperation({ summary: 'List on-call deployments' })
  listDeployments(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.oncallDomainService.listOnCallDeployments(user, query);
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Evaluate on-call rest compliance' })
  compliance(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('personId') personId?: string,
    @Query('nextShiftStart') nextShiftStart?: string,
  ) {
    return this.oncallDomainService.onCallCompliance(user, personId, nextShiftStart);
  }
}
