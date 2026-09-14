import { DocumentRemindersService } from './document-reminders.service.js';
import { DocumentRecoveryService } from './document-recovery.service.js';
import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/public.js';
import { AuditModule } from '../audit/public.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentQueryService } from './document-query.service.js';
import { DocumentCommandsService } from './document-commands.service.js';

@Module({
  imports: [PeopleModule, AuditModule],
  controllers: [DocumentsController],
  providers: [
    DocumentQueryService,
    DocumentCommandsService,
    DocumentRecoveryService,
    DocumentRemindersService,
  ],
})
export class DocumentsModule {}
