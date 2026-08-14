/** Seeds organizational, work-model, and person foundation data for Phase 2. */
import { Role, WorkTimeModelType } from '@prisma/client';

export async function seedFoundation(prisma, IDs) {
  await prisma.organizationUnit.createMany({
    data: [
      { id: IDs.ouAdmin, name: 'Verwaltung' },
      { id: IDs.ouSecurity, name: 'Pforte', parentId: IDs.ouAdmin },
      { id: IDs.ouIt, name: 'IT Bereitschaft', parentId: IDs.ouAdmin },
    ],
  });

  await prisma.workTimeModel.createMany({
    data: [
      {
        id: IDs.modelFlextime,
        name: 'Gleitzeit Vollzeit',
        type: WorkTimeModelType.FLEXTIME,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        coreTimeStart: '09:00',
        coreTimeEnd: '15:00',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.modelShift,
        name: 'Pforte Nacht',
        type: WorkTimeModelType.SHIFT,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.modelOncall,
        name: 'IT Rufbereitschaft',
        type: WorkTimeModelType.FIXED,
        weeklyHours: 39.83,
        dailyTargetHours: 7.97,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });

  await prisma.person.createMany({
    data: [
      {
        id: IDs.personEmployee,
        externalId: 'employee01',
        firstName: 'Eva',
        lastName: 'Muster',
        email: 'employee@cueq.local',
        role: Role.EMPLOYEE,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personLead,
        externalId: 'lead01',
        firstName: 'Lea',
        lastName: 'Leitung',
        email: 'lead@cueq.local',
        role: Role.TEAM_LEAD,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personPlanner,
        externalId: 'planner01',
        firstName: 'Rita',
        lastName: 'Planer',
        email: 'planner@cueq.local',
        role: Role.SHIFT_PLANNER,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouSecurity,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelShift,
      },
      {
        id: IDs.personHr,
        externalId: 'hr01',
        firstName: 'Hanna',
        lastName: 'Personal',
        email: 'hr@cueq.local',
        role: Role.HR,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personAdmin,
        externalId: 'admin01',
        firstName: 'Alex',
        lastName: 'Admin',
        email: 'admin@cueq.local',
        role: Role.ADMIN,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
    ],
  });

  await prisma.person.createMany({
    data: [
      {
        id: IDs.personItOncall,
        externalId: 'oncall01',
        firstName: 'Iris',
        lastName: 'Bereitschaft',
        email: 'oncall@cueq.local',
        role: Role.EMPLOYEE,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouIt,
        supervisorId: IDs.personLead,
        workTimeModelId: IDs.modelOncall,
      },
      {
        id: IDs.personPayroll,
        externalId: 'payroll01',
        firstName: 'Paula',
        lastName: 'Payroll',
        email: 'payroll@cueq.local',
        role: Role.PAYROLL,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personDataProtection,
        externalId: 'dataprotection01',
        firstName: 'Dana',
        lastName: 'Datenschutz',
        email: 'dataprotection@cueq.local',
        role: Role.DATA_PROTECTION,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
      {
        id: IDs.personWorksCouncil,
        externalId: 'workscouncil01',
        firstName: 'Walter',
        lastName: 'Personalrat',
        email: 'workscouncil@cueq.local',
        role: Role.WORKS_COUNCIL,
        employmentStartDate: new Date('2024-01-01T00:00:00.000Z'),
        organizationUnitId: IDs.ouAdmin,
        workTimeModelId: IDs.modelFlextime,
      },
    ],
  });
}
