import type { NativeField } from '../../../shared/native-hr/native-payload';

export const termFields: NativeField[] = [
  { key: 'effectiveFrom', type: 'datetime-local' },
  { key: 'effectiveTo', type: 'datetime-local', nullable: true },
  { key: 'organizationUnitId' },
  { key: 'supervisorId', nullable: true },
  { key: 'workTimeModelId', nullable: true },
  { key: 'weeklyHours', type: 'number' },
  { key: 'dailyTargetHours', type: 'number' },
  { key: 'workingDays', type: 'numbers' },
  { key: 'employmentGroupId' },
  { key: 'holidayCalendarId' },
  { key: 'policyReferences', type: 'json', defaultValue: '{}' },
];
export const assignmentFields: NativeField[] = [
  { key: 'personId' },
  { key: 'label' },
  { key: 'sourceSystem' },
  { key: 'externalAppointmentId', nullable: true },
  { key: 'employmentStartDate', type: 'datetime-local', nullable: true },
  { key: 'employmentEndDate', type: 'datetime-local', nullable: true },
  ...termFields.map((field) => ({ ...field, key: `term.${field.key}` })),
];
export const calendarFields: NativeField[] = [
  { key: 'code' },
  { key: 'name' },
  { key: 'version', type: 'number' },
  { key: 'holidayDates', type: 'list' },
];
export const groupFields: NativeField[] = [
  { key: 'code' },
  { key: 'name' },
  { key: 'version', type: 'number' },
  { key: 'leavePolicy.id', label: 'policyId' },
  { key: 'leavePolicy.name', label: 'policyName' },
  { key: 'leavePolicy.description', type: 'textarea' },
  { key: 'leavePolicy.version', type: 'number' },
  { key: 'leavePolicy.effectiveFrom', type: 'date' },
  { key: 'leavePolicy.effectiveTo', type: 'date', nullable: true },
  { key: 'leavePolicy.createdAt', type: 'datetime-local' },
  { key: 'leavePolicy.createdBy' },
  { key: 'leavePolicy.type', options: ['LEAVE_RULE'] },
  { key: 'leavePolicy.annualEntitlementDays', type: 'number' },
  { key: 'leavePolicy.fullTimeWeeklyHours', type: 'number' },
  { key: 'leavePolicy.workDaysPerWeek', type: 'number' },
  { key: 'leavePolicy.proRataOnEntry', type: 'checkbox' },
  { key: 'leavePolicy.proRataOnExit', type: 'checkbox' },
  { key: 'leavePolicy.carryOver.enabled', label: 'carryOverEnabled', type: 'checkbox' },
  { key: 'leavePolicy.carryOver.maxDays', type: 'number' },
  { key: 'leavePolicy.carryOver.forfeitureDeadline' },
  { key: 'leavePolicy.termChanges.proration', options: ['CALENDAR_DAYS'] },
  { key: 'leavePolicy.termChanges.partTimeBasis', options: ['WEEKLY_HOURS', 'WORKING_DAYS'] },
  { key: 'leavePolicy.termChanges.rounding', options: ['TWO_DECIMALS_AT_TOTAL'] },
  {
    key: 'leavePolicy.termChanges.carryOverPolicyAt',
    options: ['YEAR_START', 'YEAR_END', 'AS_OF'],
  },
];
