import { Role } from '@prisma/client';

async function upsertPerson(prisma, data) {
  await prisma.person.upsert({
    where: { id: data.id },
    create: data,
    update: {
      externalId: data.externalId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      employmentStartDate: data.employmentStartDate,
      organizationUnitId: data.organizationUnitId,
      supervisorId: data.supervisorId ?? null,
      workTimeModelId: data.workTimeModelId,
    },
  });
}

export async function seedDemoPeople(prisma, ids) {
  await prisma.organizationUnit.update({
    where: { id: ids.ouAdmin },
    data: { name: 'Mock University NRW - Administration' },
  });
  await prisma.organizationUnit.update({
    where: { id: ids.ouSecurity },
    data: { name: 'Mock University NRW - Security Desk' },
  });
  await prisma.organizationUnit.update({
    where: { id: ids.ouIt },
    data: { name: 'Mock University NRW - IT On-Call' },
  });

  await prisma.workTimeModel.update({
    where: { id: ids.modelFlextime },
    data: { name: 'Mock University NRW - Flextime Full-time' },
  });
  await prisma.workTimeModel.update({
    where: { id: ids.modelShift },
    data: { name: 'Mock University NRW - Security Shift' },
  });
  await prisma.workTimeModel.update({
    where: { id: ids.modelOncall },
    data: { name: 'Mock University NRW - IT On-Call Model' },
  });

  await prisma.person.update({
    where: { id: ids.personEmployee },
    data: { firstName: 'Mila', lastName: 'Demofall' },
  });
  await prisma.person.update({
    where: { id: ids.personLead },
    data: { firstName: 'Lena', lastName: 'Leitung' },
  });
  await prisma.person.update({
    where: { id: ids.personPlanner },
    data: { firstName: 'Pia', lastName: 'Planung' },
  });
  await prisma.person.update({
    where: { id: ids.personHr },
    data: { firstName: 'Hedi', lastName: 'Personal' },
  });
  await prisma.person.update({
    where: { id: ids.personAdmin },
    data: { firstName: 'Aron', lastName: 'Administration' },
  });
  await prisma.person.update({
    where: { id: ids.personItOncall },
    data: { firstName: 'Ida', lastName: 'Bereitschaft' },
  });
}

export async function seedDemoSecurityPeople(prisma, ids) {
  const securityEmploymentStart = new Date('2025-01-01T00:00:00.000Z');
  const securityPeople = [
    {
      id: ids.personSecurity1,
      externalId: 'security01',
      firstName: 'Nora',
      lastName: 'Nachtwache',
      email: 'security01@cueq.local',
      role: Role.EMPLOYEE,
      workTimeModelId: ids.modelShift,
    },
    {
      id: ids.personSecurity2,
      externalId: 'security02',
      firstName: 'Felix',
      lastName: 'Fruehschicht',
      email: 'security02@cueq.local',
      role: Role.EMPLOYEE,
      workTimeModelId: ids.modelShift,
    },
    {
      id: ids.personSecurity3,
      externalId: 'security03',
      firstName: 'Greta',
      lastName: 'Guard',
      email: 'security03@cueq.local',
      role: Role.EMPLOYEE,
      workTimeModelId: ids.modelShift,
    },
    {
      id: ids.personSecurity4,
      externalId: 'security04',
      firstName: 'Timo',
      lastName: 'Torwache',
      email: 'security04@cueq.local',
      role: Role.EMPLOYEE,
      workTimeModelId: ids.modelShift,
    },
    {
      id: ids.personSecurityPlanner,
      externalId: 'securityplanner01',
      firstName: 'Rana',
      lastName: 'Dienstplan',
      email: 'security-planner@cueq.local',
      role: Role.SHIFT_PLANNER,
      workTimeModelId: ids.modelShift,
    },
  ];

  for (const person of securityPeople) {
    await upsertPerson(prisma, {
      ...person,
      employmentStartDate: securityEmploymentStart,
      organizationUnitId: ids.ouSecurity,
      supervisorId: ids.personLead,
    });
  }
}
