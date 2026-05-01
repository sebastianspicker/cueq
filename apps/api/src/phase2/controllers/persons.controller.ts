import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { PrismaService } from '../../persistence/prisma.service';

const scopedPersonSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  organizationUnitId: true,
} as const;

@ApiTags('persons')
@ApiBearerAuth()
@Controller('v1/persons')
export class PersonsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a person by ID (HR/Admin/managers only)' })
  async getById(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<unknown> {
    if (user.role === Role.HR || user.role === Role.ADMIN) {
      const person = await this.prisma.person.findUnique({ where: { id } });
      if (!person) throw new NotFoundException('Person not found');
      return person;
    }

    const person = await this.prisma.person.findUnique({
      where: { id },
      select: scopedPersonSelect,
    });

    if (!person) throw new NotFoundException('Person not found');
    if (!user.organizationUnitId || person.organizationUnitId !== user.organizationUnitId) {
      throw new ForbiddenException('Person lookup is limited to your organization unit.');
    }

    return person;
  }
}
