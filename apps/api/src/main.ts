import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';
import { buildCorsOptions } from './common/http/cors-options';
import { buildOpenApiDocument } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors(buildCorsOptions());
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ZodExceptionFilter(httpAdapterHost));

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger setup
  // Only served in non-production environments. In production, the spec is
  // generated for CI validation (openapi:check) but never mounted on the server.
  // SwaggerModule routes bypass the APP_GUARD, so they must not be exposed in prod.
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 cueq API running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 OpenAPI docs at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
