/** Parses the short time-zone offsets used by closing-period calculations. */
const OFFSET_SIGNS = new Map<string, number>([
  ['+', 1],
  ['-', -1],
]);

/** Converts `GMT`/`UTC` short offsets to minutes and falls back to zero for malformed input. */
export function parseShortOffsetToMinutes(offset: string): number {
  if (['GMT', 'UTC'].includes(offset)) return 0;
  const body = ['GMT', 'UTC'].includes(offset.slice(0, 3)) ? offset.slice(3) : '';
  const signToken = body.at(0);
  const sign = OFFSET_SIGNS.get(signToken ?? '');
  if (sign === undefined) return 0;

  const digits = body.slice(1).replace(':', '');
  const hourLength = digits.length > 2 ? digits.length - 2 : digits.length;
  const hours = Number(digits.slice(0, hourLength));
  const minutes = Number(digits.slice(hourLength) || '0');
  if (![hours, minutes].every(Number.isInteger)) return 0;
  return sign * (hours * 60 + minutes);
}
