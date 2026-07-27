import 'reflect-metadata';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { IntegrationsController } from './integrations.controller.js';

describe('IntegrationsController webhook secret response', () => {
  it('marks the one-time signing-secret response as non-cacheable', () => {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      IntegrationsController.prototype.createEndpoint,
    ) as Array<{ name: string; value: string }> | undefined;

    expect(headers).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
});
