import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './platform/http/filters/prisma-exception.filter.js';
import { ZodExceptionFilter } from './platform/http/filters/zod-exception.filter.js';
import { buildCorsOptions } from './platform/http/cors-options.js';
import { resolveDevelopmentListenHost } from './platform/http/development-listen-host.js';
import { assertWebhookSecretEncryptionKey } from './modules/integrations/public.js';
import { buildOpenApiDocument } from './openapi.js';

async function bootstrap() {
  assertWebhookSecretEncryptionKey();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors(buildCorsOptions());
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter(httpAdapterHost));

  // Swagger routes bypass APP_GUARD, so documentation must never be mounted in production.
  if (process.env.NODE_ENV !== 'production') {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3001;
  const host = resolveDevelopmentListenHost();
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
  console.log(
    host ? `cueq API running on http://${host}:${port}` : `cueq API listening on port ${port}`,
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log(`OpenAPI docs at http://${host}:${port}/api/docs`);
  }
}

bootstrap();
