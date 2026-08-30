import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { WORKFLOW_RUNTIME_PORT } from '../../src/application/ports/workflow-runtime.port.js';
import { AbsenceDomainService } from '../../src/modules/absence/absence-domain.service.js';
import { WorkflowRuntimeService } from '../../src/modules/workflows/workflow-runtime.service.js';
import { buildOpenApiDocument } from '../../src/openapi.js';

describe('application composition and OpenAPI contract', () => {
  it('compiles the real workflow consumer and produces the public API document without app.init()', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();

    try {
      expect(app.get(WORKFLOW_RUNTIME_PORT)).toBe(app.get(WorkflowRuntimeService));
      expect(app.get(AbsenceDomainService)).toBeInstanceOf(AbsenceDomainService);

      const document = buildOpenApiDocument(app);
      expect(document.components?.securitySchemes).toMatchObject({
        bearer: { type: 'http', scheme: 'bearer' },
        'integration-token': { type: 'apiKey', in: 'header', name: 'x-integration-token' },
      });

      expect(document.paths).toHaveProperty('/health');
      expect(document.paths['/health']?.get?.security).toBeUndefined();
      expect(document.paths['/health/ready']?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths).toHaveProperty('/v1/workflows/inbox');
    } finally {
      await app.close();
    }
  });
});
