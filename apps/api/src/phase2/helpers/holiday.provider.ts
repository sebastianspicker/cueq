import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

const HOLIDAY_FIXTURE_PATHS = [
  resolve(__dirname, '../../../../../fixtures/calendars'),
  resolve(process.cwd(), 'fixtures/calendars'),
  resolve(process.cwd(), '../../fixtures/calendars'),
];

@Injectable()
export class HolidayProvider {
  private readonly holidayCache = new Map<number, Set<string>>();

  loadHolidayDates(year: number): Set<string> {
    const cached = this.holidayCache.get(year);
    if (cached) {
      return cached;
    }

    for (const basePath of HOLIDAY_FIXTURE_PATHS) {
      const filePath = resolve(basePath, `nrw-holidays-${year}.json`);
      try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as {
          holidays?: Array<{ date?: string }>;
        };
        const dates = new Set(
          (parsed.holidays ?? []).map((entry) => entry.date).filter(Boolean) as string[],
        );
        this.holidayCache.set(year, dates);
        return dates;
      } catch {
        // try next lookup location
      }
    }

    const empty = new Set<string>();
    this.holidayCache.set(year, empty);
    return empty;
  }

  holidayDatesBetween(start: string, end: string): string[] {
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T00:00:00.000Z`);
    const holidays = new Set<string>();

    for (let year = startDate.getUTCFullYear(); year <= endDate.getUTCFullYear(); year += 1) {
      for (const holiday of this.loadHolidayDates(year)) {
        holidays.add(holiday);
      }
    }

    return [...holidays];
  }
}
