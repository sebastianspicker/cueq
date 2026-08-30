/** Reads environment-backed closing configuration at call time. */

/** Reads the automatic-cutoff switch, defaulting to enabled unless explicitly disabled. */
export function closingAutoCutoffEnabled(): boolean {
  const raw = (process.env.CLOSING_AUTO_CUTOFF_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

/** Reads the manual review-start switch, which remains disabled by default. */
export function allowManualReviewStart(): boolean {
  const raw = (process.env.CLOSING_ALLOW_MANUAL_REVIEW_START ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

/** Reads and clamps the configured next-month cutoff day. */
export function closingCutoffDay(): number {
  const parsed = Number(process.env.CLOSING_CUTOFF_DAY ?? '3');
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.min(28, Math.max(1, Math.trunc(parsed)));
}

/** Reads and clamps the configured local cutoff hour. */
export function closingCutoffHour(): number {
  const parsed = Number(process.env.CLOSING_CUTOFF_HOUR ?? '12');
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.min(23, Math.max(0, Math.trunc(parsed)));
}

/** Reads the booking-gap threshold and rejects implausibly small configuration values. */
export function closingBookingGapMinutes(): number {
  const parsed = Number(process.env.CLOSING_BOOKING_GAP_MINUTES ?? '240');
  return Number.isFinite(parsed) && parsed >= 30 ? Math.trunc(parsed) : 240;
}

/** Reads the absolute balance threshold used to flag closing anomalies. */
export function closingBalanceAnomalyHours(): number {
  const parsed = Number(process.env.CLOSING_BALANCE_ANOMALY_HOURS ?? '40');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}
