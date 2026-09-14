import { describe, expect, it } from 'vitest';
import { deliverWebhookTargets } from '../webhook-delivery-dispatch.js';

it('delivers endpoint waves of eight, renewing before each wave and preserving order', async () => {
  const endpoints = Array.from({ length: 19 }, (_, i) => ({
    id: `endpoint-${i}`,
    url: `https://example.invalid/${i}`,
    secretRef: 'encrypted',
  }));
  let active = 0;
  let maximum = 0;
  let renewals = 0;
  const result = await deliverWebhookTargets({
    event: {
      id: 'event',
      eventType: 'test',
      aggregateType: 'test',
      aggregateId: 'test',
      payload: {},
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date(0),
    },
    endpoints,
    signingSecrets: new Map(endpoints.map((e) => [e.id, 'synthetic-test-key'])),
    initialClaimUntil: new Date(0),
    timeoutMs: 1000,
    configurationError: 'unavailable',
    renewClaim: async () => {
      expect(active).toBe(0);
      renewals++;
      return new Date(renewals);
    },
    post: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return { status: 200, body: '' };
    },
  });
  expect(maximum).toBe(8);
  expect(renewals).toBe(3);
  expect(result.records.map((r) => r.endpointId)).toEqual(endpoints.map((e) => e.id));
  expect(result.eventFailed).toBe(false);
});

describe('lease renewal failure', () => {
  it('does not dispatch the next wave', async () => {
    let posts = 0;
    await expect(
      deliverWebhookTargets({
        event: {
          id: 'event',
          eventType: 'test',
          aggregateType: 'test',
          aggregateId: 'test',
          payload: {},
          status: 'PENDING',
          attempts: 0,
          createdAt: new Date(0),
        },
        endpoints: [{ id: 'target', url: 'https://example.invalid', secretRef: '' }],
        signingSecrets: new Map(),
        initialClaimUntil: new Date(0),
        timeoutMs: 1000,
        configurationError: 'unavailable',
        renewClaim: async () => {
          throw new Error('lease lost');
        },
        post: async () => {
          posts++;
          return { status: 200, body: '' };
        },
      }),
    ).rejects.toThrow('lease lost');
    expect(posts).toBe(0);
  });
});
