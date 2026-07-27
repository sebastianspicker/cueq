/** Parses the fail-closed CLI confirmation contract; dry-run is the default. */
export function parseWebhookSecretMigrationMode(args: string[]): { dryRun: boolean } {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  if (
    normalizedArgs.length === 0 ||
    (normalizedArgs.length === 1 && normalizedArgs[0] === '--dry-run')
  ) {
    return { dryRun: true };
  }
  if (
    normalizedArgs.length === 2 &&
    normalizedArgs[0] === '--apply' &&
    normalizedArgs[1] === '--maintenance-window-confirmed'
  ) {
    return { dryRun: false };
  }
  throw new Error('Unsupported webhook secret migration arguments.');
}
