import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger setup
  // The generated spec is served at /api/docs and can be exported as JSON
  // for CI validation against the checked-in spec.
  // ---------------------------------------------------------------------------
  const config = new DocumentBuilder()
    .setTitle('cueq API')
    .setDescription(
      'Integrated time-tracking, absence-management, and shift-planning API for a German university (NRW / TV-L)',
    )
    .setVersion('0.0.1')
    .addTag('health', 'Health check endpoints')
    .addTag('bookings', 'Time booking endpoints')
    .addTag('absences', 'Absence and leave endpoints')
    .addTag('roster', 'Shift planning endpoints')
    .addTag('workflows', 'Approval workflow endpoints')
    .addTag('closing', 'Monthly closing endpoints')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 cueq API running on http://localhost:${port}`);
  console.log(`📖 OpenAPI docs at http://localhost:${port}/api/docs`);
}

bootstrap();
