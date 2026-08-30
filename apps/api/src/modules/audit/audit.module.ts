/** Immutable audit persistence and transactional outbox support. */
import { Global, Module } from '@nestjs/common';
import { AUDIT_WRITER_PORT } from '../../application/ports/audit-writer.port.js';
import { AuditController } from './audit.controller.js';
import { AuditHelper } from './audit.helper.js';
import { EventOutboxHelper } from './event-outbox.helper.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditHelper,
    EventOutboxHelper,
    { provide: AUDIT_WRITER_PORT, useExisting: AuditHelper },
  ],
  exports: [AuditHelper, EventOutboxHelper, AUDIT_WRITER_PORT],
})
export class AuditModule {}
