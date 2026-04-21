/** Interval types that count as productive work for compliance purposes. */
export const WORK_INTERVAL_TYPES: ReadonlySet<string> = new Set(['WORK', 'DEPLOYMENT']);

/** Standard working days per week (Mon-Fri). Used for daily hour prorating. */
export const WEEKDAYS_PER_WEEK = 5;

/** Minimum break minutes for Pforte night shifts (operational baseline). */
export const NIGHT_SHIFT_MIN_BREAK_MINUTES = 45;

/** Shift type identifier for night shifts. */
export const SHIFT_TYPE_NIGHT = 'NIGHT';
