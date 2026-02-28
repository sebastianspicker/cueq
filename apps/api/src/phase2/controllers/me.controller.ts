import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { Phase2Service } from '../phase2.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.me(user);
  }
}
