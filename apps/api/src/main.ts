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
  // The generated spec is served at /api/docs and can be exported as JSON
  // for CI validation against the checked-in spec.
  // ---------------------------------------------------------------------------
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 cueq API running on http://localhost:${port}`);
  console.log(`📖 OpenAPI docs at http://localhost:${port}/api/docs`);
}

bootstrap();
