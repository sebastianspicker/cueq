import type { useTranslations } from 'next-intl';

export interface DashboardSummary {
  personId: string;
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
  id: string;
  startTime: string;
  endTime: string | null;
}

export type TranslationFn = ReturnType<typeof useTranslations>;
