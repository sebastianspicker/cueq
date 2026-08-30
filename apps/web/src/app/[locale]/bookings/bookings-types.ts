export interface Booking {
  id: string;
  personId: string;
  timeTypeId: string;
  timeTypeCode: string;
  timeTypeCategory: string;
  startTime: string;
  endTime: string | null;
  source: string;
  note?: string | null;
  shiftId?: string | null;
}
