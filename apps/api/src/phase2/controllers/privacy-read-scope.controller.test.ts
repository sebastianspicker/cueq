import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ALLOWED_ROLES_METADATA } from '../../common/decorators/roles.decorator.js';
import { CalendarController } from './calendar.controller.js';
import { PersonsController } from './persons.controller.js';
import { RostersController } from './rosters.controller.js';

const calendarReadRoles = [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR];
const rosterReadRoles = [...calendarReadRoles, Role.ADMIN];
const rosterDetailRoles = [Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN];

function personInOrganizationUnit(organizationUnitId: string) {
  return {
    id: 'person-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: Role.EMPLOYEE,
    organizationUnitId,
    workTimeModelId: 'model-1',
  };
}

describe('privacy read scopes', () => {
  it('sets the public-alpha role allowlist on team calendar and roster reads', () => {
    expect(
      Reflect.getMetadata(ALLOWED_ROLES_METADATA, CalendarController.prototype.teamCalendar),
    ).toEqual(calendarReadRoles);

    expect(
      Reflect.getMetadata(ALLOWED_ROLES_METADATA, RostersController.prototype.current),
    ).toEqual(rosterReadRoles);
    for (const method of ['byId', 'planVsActual'] as const) {
      expect(
        Reflect.getMetadata(ALLOWED_ROLES_METADATA, RostersController.prototype[method]),
      ).toEqual(rosterDetailRoles);
    }
  });

  it('restricts person reads to HR and admin while selecting only public fields', async () => {
    const person = personInOrganizationUnit('ou-1');
    const prisma = { person: { findUnique: vi.fn().mockResolvedValue(person) } };
    const controller = new PersonsController(prisma as never);

    expect(
      Reflect.getMetadata(ALLOWED_ROLES_METADATA, PersonsController.prototype.getById),
    ).toEqual([Role.HR, Role.ADMIN]);
    await expect(
      controller.getById(
        { subject: 'hr-1', email: 'hr@example.invalid', role: Role.HR, claims: {} },
        person.id,
      ),
    ).resolves.toEqual(person);
    expect(prisma.person.findUnique).toHaveBeenCalledWith({
      where: { id: person.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationUnitId: true,
        workTimeModelId: true,
      },
    });
  });

  it('preserves person not-found behavior', async () => {
    const prisma = { person: { findUnique: vi.fn().mockResolvedValue(null) } };
    const controller = new PersonsController(prisma as never);

    await expect(
      controller.getById(
        { subject: 'hr-1', email: 'hr@example.invalid', role: Role.HR, claims: {} },
        'missing-person',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
