import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  truncateForStorage,
  webhookDispatchError,
  webhookEnvelope,
  webhookHeaders,
} from './webhook-dispatch-format.js';

describe('webhook dispatch formatting', () => {
  it('creates a signed, stable webhook envelope and bounds persisted diagnostics', () => {
    const event = {
      id: 'event-1',
      eventType: 'shift.updated',
      aggregateType: 'Shift',
      aggregateId: 'shift-1',
      payload: 'raw payload',
      createdAt: new Date('2026-08-04T08:00:00.000Z'),
    };
    const body = JSON.stringify(webhookEnvelope(event));

    expect(webhookEnvelope(event)).toMatchObject({
      eventId: 'event-1',
      payload: { payload: 'raw payload' },
    });
    expect(webhookHeaders(event.eventType, 'secret', body)['X-Cueq-Signature']).toBe(
      `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`,
    );
    expect(truncateForStorage('abcdef', 3)).toBe('abc...[truncated]');
    expect(truncateForStorage(null, 3)).toBeNull();
    expect(webhookDispatchError(new Error('Webhook receiver returned 500'))).toBe(
      'Webhook receiver returned 500',
    );
    expect(webhookDispatchError(new Error('socket refused'))).toBe(
      'Webhook delivery request failed.',
    );
  });
});
