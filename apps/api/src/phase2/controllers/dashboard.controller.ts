import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('v1/dashboard')
export class DashboardController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('me')
  @ApiOperation({ summary: 'Get dashboard summary for the authenticated employee' })
  getDashboard(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.dashboard(user);
  }
}
