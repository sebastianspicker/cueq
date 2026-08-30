/** Exposes the authenticated identity's self-service profile. */
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { PersonHelper } from '../people/public.js';

/** Authenticated self-service identity boundary. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(@Inject(PersonHelper) private readonly personHelper: PersonHelper) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ schema: { type: 'object' } })
  async getMe(@CurrentUser() user: AuthenticatedIdentity) {
    const person = await this.personHelper.personForUser(user);

    return {
      id: person.id,
      email: person.email,
      role: person.role,
      organizationUnitId: person.organizationUnitId,
      firstName: person.firstName,
      lastName: person.lastName,
    };
  }
}
