import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { PrismaService } from '../../persistence/prisma.service';

@ApiTags('persons')
@ApiBearerAuth()
@Controller('v1/persons')
export class PersonsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a person by ID (HR/Admin/managers only)' })
  async getById(
    @CurrentUser() _user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<unknown> {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }
}
