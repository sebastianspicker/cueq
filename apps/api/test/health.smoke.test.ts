import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health/health.controller';

describe('@cueq/api smoke test', () => {
  it('returns a healthy status payload', () => {
    const controller = new HealthController();
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeTypeOf('string');
    expect(result.version).toBeTypeOf('string');
  });
});
