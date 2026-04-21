import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { assertWebhookDispatchTargetUrl, assertWebhookTargetUrl } from './webhook-url';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const lookupMock = vi.mocked(lookup);

afterEach(() => {
  lookupMock.mockReset();
});

describe('assertWebhookTargetUrl', () => {
  it('allows localhost by default in non-production runtimes', () => {
    expect(() =>
      assertWebhookTargetUrl('http://127.0.0.1:9000/webhook', { NODE_ENV: 'test' }),
    ).not.toThrow();
  });

  it('rejects localhost and private network targets in production by default', () => {
    expect(() =>
      assertWebhookTargetUrl('http://127.0.0.1:9000/webhook', { NODE_ENV: 'production' }),
    ).toThrow(/must not target localhost or private network addresses/iu);

    expect(() =>
      assertWebhookTargetUrl('http://192.168.1.5:8080/webhook', { NODE_ENV: 'production' }),
    ).toThrow(/must not target localhost or private network addresses/iu);
  });

  it('rejects trailing-dot localhost/private variants in production', () => {
    expect(() =>
      assertWebhookTargetUrl('http://localhost.:9000/webhook', { NODE_ENV: 'production' }),
    ).toThrow(/must not target localhost or private network addresses/iu);

    expect(() =>
      assertWebhookTargetUrl('http://127.0.0.1.:9000/webhook', { NODE_ENV: 'production' }),
    ).toThrow(/must not target localhost or private network addresses/iu);
  });

  it('allows public https targets in production', () => {
    expect(() =>
      assertWebhookTargetUrl('https://example.com/cueq', { NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('rejects public http targets in production when private-target override is not enabled', () => {
    expect(() =>
      assertWebhookTargetUrl('http://example.com/cueq', { NODE_ENV: 'production' }),
    ).toThrow(/must use https in production/iu);
  });

  it('rejects unsupported protocols and embedded credentials', () => {
    expect(() =>
      assertWebhookTargetUrl('ftp://example.com/cueq', { NODE_ENV: 'production' }),
    ).toThrow(/protocol must be http or https/iu);

    expect(() =>
      assertWebhookTargetUrl('https://user:pass@example.com/cueq', { NODE_ENV: 'production' }),
    ).toThrow(/must not include user credentials/iu);
  });

  it('supports explicit override to allow private targets', () => {
    expect(() =>
      assertWebhookTargetUrl('http://localhost:8080/hook', {
        NODE_ENV: 'production',
        WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
      }),
    ).not.toThrow();
  });
});

describe('assertWebhookDispatchTargetUrl', () => {
  it('rejects hostnames that resolve to private addresses in production', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', { NODE_ENV: 'production' }),
    ).rejects.toThrow(/must not target localhost or private network addresses/iu);
  });

  it('allows hostnames that resolve to public addresses in production', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', { NODE_ENV: 'production' }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('skips dns private-target enforcement when explicit private-target override is enabled', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', {
        NODE_ENV: 'production',
        WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
      }),
    ).resolves.toBeInstanceOf(URL);
  });
});
