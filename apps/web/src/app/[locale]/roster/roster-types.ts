interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface RosterAssignment {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
}

interface RosterShift {
  id: string;
  rosterId: string;
  personId: string | null;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignments: RosterAssignment[];
}

export interface RosterDetail {
  id: string;
  organizationUnitId: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  publishedAt: string | null;
  shifts: RosterShift[];
  members: RosterMember[];
}

interface PlanVsActualSlot {
  shiftId: string;
  minStaffing: number;
  assignedHeadcount: number;
  plannedHeadcount: number;
  actualHeadcount: number;
  delta: number;
  compliant: boolean;
}

export interface PlanVsActual {
  rosterId: string;
  totalSlots: number;
  mismatchedSlots: number;
  complianceRate: number;
  understaffedSlots: number;
  coverageRate: number;
  slots: PlanVsActualSlot[];
}
