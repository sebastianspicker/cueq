/** Institutional reporting may raise, but never lower, the existing privacy floor. */
export function reportingPrivacyThreshold(): number {
  const parsed = Math.trunc(Number(process.env.REPORT_MIN_GROUP_SIZE ?? 5));
  return Number.isFinite(parsed) && parsed >= 5 ? parsed : 5;
}
