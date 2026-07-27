import { describe, expect, it } from 'vitest';
import { resolveDevelopmentListenHost } from './development-listen-host.js';

describe('resolveDevelopmentListenHost', () => {
  it('binds non-production API processes to loopback by default', () => {
    expect(resolveDevelopmentListenHost({ NODE_ENV: 'development' })).toBe('127.0.0.1');
  });

  it('honors an explicit non-production development host override', () => {
    expect(
      resolveDevelopmentListenHost({ NODE_ENV: 'development', CUEQ_DEV_HOST: '0.0.0.0' }),
    ).toBe('0.0.0.0');
  });

  it('leaves production host selection to the deployment runtime', () => {
    expect(
      resolveDevelopmentListenHost({ NODE_ENV: 'production', CUEQ_DEV_HOST: '127.0.0.1' }),
    ).toBeUndefined();
  });
});
