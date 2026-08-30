import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArchitecture } from '../../../../scripts/check-architecture.mjs';

const PACKAGE_NAMES = ['contracts', 'policy', 'domain', 'web', 'api'] as const;
const temporaryRoots: string[] = [];

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'cueq-architecture-'));
  temporaryRoots.push(root);
  for (const packageName of PACKAGE_NAMES) {
    const parent = packageName === 'api' || packageName === 'web' ? 'apps' : 'packages';
    await writeFixtureFile(
      root,
      `${parent}/${packageName}/package.json`,
      JSON.stringify({ name: `@cueq/${packageName}`, version: '0.0.0' }),
    );
  }
  await Promise.all(
    Object.entries(files).map(([relativePath, content]) =>
      writeFixtureFile(root, relativePath, content),
    ),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('architecture boundary checker fixtures', () => {
  it('permits modules to consume another feature only through its public surface', async () => {
    const root = await createFixture({
      'apps/api/src/modules/absence/public.ts': 'export const absence = true;\n',
      'apps/api/src/modules/workflows/consumer.ts':
        "import { absence } from '../absence/public.js';\nexport { absence };\n",
      'apps/api/src/platform/http/transport.ts': 'export const transport = true;\n',
    });

    await expect(checkArchitecture(root)).resolves.toMatchObject({ errors: [] });
  });

  it.each([
    [
      'platform-to-feature deep import',
      'apps/api/src/platform/http/transport.ts',
      "import '../../modules/absence/workflow-absence-effects.service.js';\n",
      /may not import absence feature internals/iu,
    ],
    [
      'cross-feature internal import',
      'apps/api/src/modules/workflows/consumer.ts',
      "import { service } from '../absence/workflow-absence-effects.service.js';\n",
      /may not import absence feature internals/iu,
    ],
    [
      'forbidden application-to-platform edge',
      'apps/api/src/application/use-case.ts',
      "import { guard } from '../platform/auth/guard.js';\n",
      /violates the API application -> platform layer edge/iu,
    ],
    [
      'foreign aggregate persistence mutation in workflows',
      'apps/api/src/modules/workflows/forbidden-write.ts',
      'await tx.absence.update({ where: { id: workflowId }, data: {} });\n',
      /may not directly mutate absence via tx\.absence\.update/iu,
    ],
  ])('rejects a %s', async (_label, fixturePath, source, expectedError) => {
    const root = await createFixture({ [fixturePath]: source });

    await expect(checkArchitecture(root)).resolves.toMatchObject({
      errors: [expect.stringMatching(expectedError)],
    });
  });

  it('rejects a feature module cycle and forwardRef escape hatch', async () => {
    const root = await createFixture({
      'apps/api/src/modules/absence/absence.module.ts':
        "import { WorkflowsModule } from '../workflows/public.js';\n@Module({ imports: [forwardRef(() => WorkflowsModule)] })\nexport class AbsenceModule {}\n",
      'apps/api/src/modules/workflows/workflows.module.ts':
        "import { AbsenceModule } from '../absence/public.js';\n@Module({ imports: [AbsenceModule] })\nexport class WorkflowsModule {}\n",
    });

    await expect(checkArchitecture(root)).resolves.toMatchObject({
      errors: [
        expect.stringMatching(/uses forwardRef\(\); feature module dependencies must be acyclic/iu),
        expect.stringMatching(/Feature module cycle: absence -> workflows -> absence/iu),
      ],
    });
  });
});
