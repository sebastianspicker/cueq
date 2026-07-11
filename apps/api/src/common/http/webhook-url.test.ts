import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import {
  assertWebhookDispatchTargetUrl,
  assertWebhookTargetUrl,
  isPublicWebhookAddress,
  resolveWebhookDispatchTarget,
} from './webhook-url';

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

  it('supports explicit private-target denial outside production', () => {
    expect(() =>
      assertWebhookTargetUrl('http://localhost:8080/hook', {
        NODE_ENV: 'test',
        WEBHOOK_ALLOW_PRIVATE_TARGETS: 'false',
      }),
    ).toThrow(/must not target localhost or private network addresses/iu);
  });
});

describe('assertWebhookDispatchTargetUrl', () => {
  it('rejects hostnames that resolve to private addresses in production', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', { NODE_ENV: 'production' }),
    ).rejects.toThrow(/must resolve only to public network addresses/iu);
  });

  it('allows hostnames that resolve to public addresses in production', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', { NODE_ENV: 'production' }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects mixed public and private DNS results across address families', async () => {
    lookupMock.mockResolvedValue([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '10.0.0.4', family: 4 },
    ] as never);

    await expect(
      assertWebhookDispatchTargetUrl('https://dispatch.example/hook', { NODE_ENV: 'test' }),
    ).rejects.toThrow(/must resolve only to public network addresses/iu);
  });

  it('rejects DNS lookup errors and empty results', async () => {
    lookupMock.mockRejectedValueOnce(new Error('resolver internals'));
    await expect(assertWebhookDispatchTargetUrl('https://dispatch.example/hook')).rejects.toThrow(
      'Webhook target DNS lookup failed.',
    );

    lookupMock.mockResolvedValueOnce([] as never);
    await expect(assertWebhookDispatchTargetUrl('https://dispatch.example/hook')).rejects.toThrow(
      'Webhook target DNS lookup returned no addresses.',
    );
  });

  it('uses verbatim all-address lookup and pins the first vetted result', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ] as never);

    await expect(
      resolveWebhookDispatchTarget('https://dispatch.example/hook'),
    ).resolves.toMatchObject({ address: '93.184.216.34', family: 4 });
    expect(lookupMock).toHaveBeenCalledWith('dispatch.example', {
      all: true,
      verbatim: true,
    });
  });
});

describe('isPublicWebhookAddress', () => {
  it.each([
    '127.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '192.0.2.10',
    '198.51.100.4',
    '203.0.113.8',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    'fec0::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicWebhookAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '2606:4700:4700::1111'])('accepts public address %s', (address) => {
    expect(isPublicWebhookAddress(address)).toBe(true);
  });
});
