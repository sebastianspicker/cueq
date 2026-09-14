import type { useTranslations } from 'next-intl';

export interface DashboardSummary {
  assignmentId: string;
  personId: string;
  dayStart: string;
  dayEnd: string;
  todayWorkedMilliseconds: number;
  modelName: string;
  todayTargetHours: number;
  currentBalanceHours: number;
  todayBookingsCount: number;
  hasFirstBooking: boolean;
  showOrientation: boolean;
  clockInTimeTypeId: string | null;
  quickActions: string[];
  period: { start: string; end: string } | null;
  now: string;
}

export interface DashboardBooking {
  assignmentId: string;
  id: string;
  startTime: string;
  endTime: string | null;
}

export type TranslationFn = ReturnType<typeof useTranslations>;
