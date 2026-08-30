/** Shared deterministic IDs and layer orchestration for the synthetic database seed hierarchy. */
import { execFileSync } from 'node:child_process';

export const FIXED_SEED_TIMESTAMP = new Date('2026-03-01T00:00:00.000Z');

/** Returns a reproducible CUID-like primary key so seed relationships remain stable. */
export function stableCuid(index) {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error(`Invalid stable ID index: ${index}`);
  return `c${String(index).padStart(24, '0')}`;
}

/** Runs a child seed layer with only the supported reset or seed commands, preserving its process output and failure. */
export function runSeedLayer(scriptPath, command) {
  if (command !== 'seed' && command !== 'reset') {
    throw new Error(`Unsupported seed layer command: ${command}`);
  }
  execFileSync(process.execPath, [scriptPath, command], { stdio: 'inherit', env: process.env });
}
