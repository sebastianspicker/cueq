/** Generic recipient inbox without sensitive resource labels. */
import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { CursorPagination } from '../../platform/http/cursor-pagination.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PersonHelper } from '../people/public.js';
import { InboxService } from './inbox.service.js';

@ApiTags('inbox')
@ApiBearerAuth()
@Controller('v1/inbox')
export class InboxController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(InboxService) private readonly inbox: InboxService,
  ) {}

  @Get()
  @Authenticated()
  @CursorPagination()
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.inbox.list((await this.people.personForUser(user)).id, query);
  }

  @Post(':id/read')
  @Authenticated()
  async markRead(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) notificationId: string,
  ) {
    return this.inbox.markRead((await this.people.personForUser(user)).id, notificationId);
  }
}
