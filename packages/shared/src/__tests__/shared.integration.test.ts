import { describe, expect, it } from 'vitest';
import { CreateBookingSchema } from '../schemas/booking';

describe('@cueq/shared integration', () => {
  it('validates create booking payloads', () => {
    const payload = {
      personId: 'c00000000000000000000001',
      timeTypeId: 'c00000000000000000000002',
      startTime: '2026-03-02T08:00:00.000Z',
      source: 'WEB',
    };

    expect(CreateBookingSchema.parse(payload)).toMatchObject(payload);
  });
});
