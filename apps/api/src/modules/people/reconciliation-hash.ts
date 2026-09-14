import { createHash } from 'node:crypto';

export function reconciliationHash(fields: Record<string, string | undefined>) {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');
}
