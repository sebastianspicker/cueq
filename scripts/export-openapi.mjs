#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { NestFactory } = requireFromApi('@nestjs/core');
const { AppModule } = requireFromApi('./dist/app.module.js');
const { buildOpenApiDocument } = requireFromApi('./dist/openapi.js');

if (!AppModule || !buildOpenApiDocument) {
  throw new Error('Unable to resolve AppModule/buildOpenApiDocument from compiled API artifacts.');
}

async function main() {
  const outputPath = resolve(
    process.cwd(),
    process.argv[2] ?? 'contracts/openapi/openapi.generated.json',
  );
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const document = buildOpenApiDocument(app);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(document, null, 2), 'utf8');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('OpenAPI export failed:', error);
  process.exit(1);
});
