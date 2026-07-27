import { describe, expect, it } from 'vitest';
import { parseWebhookSecretMigrationMode } from './webhook-secret-migration-args.js';

describe('parseWebhookSecretMigrationMode', () => {
  it.each([{ args: [] }, { args: ['--dry-run'] }, { args: ['--', '--dry-run'] }])(
    'defaults safely to dry-run for $args',
    ({ args }) => {
      expect(parseWebhookSecretMigrationMode(args)).toEqual({ dryRun: true });
    },
  );

  it.each([
    { args: ['--apply', '--maintenance-window-confirmed'] },
    { args: ['--', '--apply', '--maintenance-window-confirmed'] },
  ])('requires explicit apply and maintenance confirmation flags for $args', ({ args }) => {
    expect(parseWebhookSecretMigrationMode(args)).toEqual({ dryRun: false });
  });

  it.each([
    ['--apply'],
    ['--maintenance-window-confirmed'],
    ['--apply', '--dry-run'],
    ['--maintenance-window-confirmed', '--apply'],
  ])('rejects unsupported or unsafe arguments: %s', (...args) => {
    expect(() => parseWebhookSecretMigrationMode(args)).toThrow(
      'Unsupported webhook secret migration arguments.',
    );
  });
});
