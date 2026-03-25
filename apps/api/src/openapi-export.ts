import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi';

async function exportOpenApi(outputPath?: string) {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);

  const resolvedOutput = resolve(
    process.cwd(),
    outputPath ?? 'contracts/openapi/openapi.generated.json',
  );

  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, JSON.stringify(document, null, 2), 'utf8');
  await app.close();
}

if (require.main === module) {
  exportOpenApi(process.argv[2]).catch((error) => {
    console.error('Failed to export OpenAPI document:', error);
    process.exit(1);
  });
}

export { exportOpenApi };
