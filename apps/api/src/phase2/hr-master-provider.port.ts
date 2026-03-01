export type HrMasterRecord = {
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  organizationUnit: string;
  workTimeModel: string;
  weeklyHours: string;
  dailyTargetHours: string;
  supervisorExternalId?: string;
};

export const HR_MASTER_PROVIDER = Symbol('HR_MASTER_PROVIDER');

export interface HrMasterProviderPort {
  fetchMasterRecords(): Promise<HrMasterRecord[]>;
}

export class StubHrMasterProvider implements HrMasterProviderPort {
  async fetchMasterRecords(): Promise<HrMasterRecord[]> {
    return [];
  }
}
