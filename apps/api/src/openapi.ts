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
    .addTag('auth', 'Authentication and identity endpoints')
    .addTag('dashboard', 'Employee dashboard endpoints')
    .addTag('bookings', 'Time booking endpoints')
    .addTag('absences', 'Absence and leave endpoints')
    .addTag('calendar', 'Team calendar endpoints')
    .addTag('roster', 'Shift planning endpoints')
    .addTag('workflows', 'Approval workflow endpoints')
    .addTag('oncall', 'On-call deployments and compliance endpoints')
    .addTag('closing', 'Monthly closing endpoints')
    .addTag('terminal-sync', 'Terminal offline sync endpoints')
    .addTag('hr-import', 'HR master data import endpoints')
    .addTag('policy', 'Policy catalog and introspection endpoints')
    .addTag('time-engine', 'Rule evaluation endpoints for breaks, rest, max-hours, and surcharges')
    .addTag('integrations', 'Event outbox and webhook delivery endpoints')
    .addTag('reports', 'Privacy-preserving aggregated reporting endpoints')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
