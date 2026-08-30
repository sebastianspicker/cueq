/** Defines the HR master-data provider contract and its portable record shape. */
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

/** Nest injection token for the configured HR master-data source. */
export const HR_MASTER_PROVIDER = Symbol('HR_MASTER_PROVIDER');

/** Boundary for master-data sources consumed by the auditable HR import pipeline. */
export interface HrMasterProviderPort {
  fetchMasterRecords(): Promise<HrMasterRecord[]>;
}

/** Default no-op provider used when no external HR source is configured. */
export class StubHrMasterProvider implements HrMasterProviderPort {
  async fetchMasterRecords(): Promise<HrMasterRecord[]> {
    return [];
  }
}
