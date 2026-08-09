import type {
  OnCallComplianceCheck as SharedOnCallComplianceCheck,
  OnCallDeployment as SharedOnCallDeployment,
  OnCallRotation as SharedOnCallRotation,
  UserProfile,
} from '@cueq/shared';

export type OnCallRotation = SharedOnCallRotation;
export type OnCallDeployment = SharedOnCallDeployment;
export type ComplianceResult = SharedOnCallComplianceCheck;
export type MeResponse = Pick<UserProfile, 'id' | 'role'>;
