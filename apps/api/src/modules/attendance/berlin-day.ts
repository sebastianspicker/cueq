const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  hourCycle: 'h23',
});

function midnight(year: number, month: number, day: number) {
  // At UTC midnight Berlin is always 01:00 or 02:00; probing noon on the
  // preceding date avoids selecting the post-transition offset on DST Sundays.
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const before = new Date(anchor.getTime() - 6 * 3600_000);
  const offset = (Number(hourFormatter.format(before)) - before.getUTCHours() + 24) % 24;
  return new Date(anchor.getTime() - offset * 3600_000);
}

export function berlinDayBounds(now: Date) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  return { dayStart: midnight(year, month, day), dayEnd: midnight(year, month, day + 1) };
}
