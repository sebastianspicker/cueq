/** Exposes authorized personnel-directory endpoints. */
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe.js';
import { PrismaService } from '../../persistence/prisma.service.js';

/** HR/Admin-only personnel lookup that returns an explicit non-secret profile projection. */
@ApiTags('persons')
@ApiBearerAuth()
@Controller('v1/persons')
export class PersonsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(':id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a person by ID (HR/Admin only)' })
  async getById(
    @CurrentUser() _user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<unknown> {
    const person = await this.prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationUnitId: true,
        workTimeModelId: true,
      },
    });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }
}
