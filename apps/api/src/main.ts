import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
