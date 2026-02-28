import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication) {
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

  return SwaggerModule.createDocument(app, config);
}
