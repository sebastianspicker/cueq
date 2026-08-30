const DEFAULT_WEBHOOK_CLAIM_LEASE_MS = 15 * 60_000;

export type WebhookDispatchSettings = {
  batchSize: number;
  maxAttempts: number;
  timeoutMs: number;
  claimLeaseMs: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

/** Reads dispatch limits once per run so the returned values can be audited with its counters. */
export function webhookDispatchSettings(
  environment: NodeJS.ProcessEnv = process.env,
): WebhookDispatchSettings {
  const timeoutMs = positiveInteger(environment.WEBHOOK_REQUEST_TIMEOUT_MS, 5000);
  const configuredClaimLeaseMs = positiveInteger(environment.WEBHOOK_CLAIM_LEASE_MS, 0);

  return {
    batchSize: positiveInteger(environment.WEBHOOK_DISPATCH_BATCH_SIZE, 50),
    maxAttempts: positiveInteger(environment.WEBHOOK_MAX_ATTEMPTS, 5),
    timeoutMs,
    claimLeaseMs: Math.max(configuredClaimLeaseMs, DEFAULT_WEBHOOK_CLAIM_LEASE_MS, timeoutMs * 2),
  };
}
