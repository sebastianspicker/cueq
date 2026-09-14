/** Authenticated personal account reads and explicit HR reconciliation. */
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { SplitTimeAccountSchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { CursorPagination } from '../../platform/http/cursor-pagination.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { TimeAccountService } from './time-account.service.js';

@ApiTags('time-accounts')
@ApiBearerAuth()
@Controller('v1/time-accounts')
export class TimeAccountsController {
  constructor(@Inject(TimeAccountService) private readonly accounts: TimeAccountService) {}

  @Get()
  @Authenticated()
  @CursorPagination()
  @ApiOperation({ summary: 'List time accounts for one selected appointment' })
  listMine(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.accounts.listMine(user, query);
  }

  @Post(':id/split')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Explicitly split and reconcile one open-period time account' })
  split(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body(new ZodValidationPipe(SplitTimeAccountSchema)) payload: unknown,
  ) {
    return this.accounts.split(user, id, payload);
  }
}
