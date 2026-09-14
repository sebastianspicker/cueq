/** Global lifecycle feature and transaction-local generic inbox provider. */
import { LifecycleRemindersService } from './lifecycle-reminders.service.js';
import { Global, Module } from '@nestjs/common';
import { INBOX_NOTIFICATIONS_PORT } from '../../application/ports/inbox-notifications.port.js';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { InboxController } from './inbox.controller.js';
import { InboxNotificationsService } from './inbox-notifications.service.js';
import { InboxService } from './inbox.service.js';
import { LifecycleAutomationWorker } from './lifecycle-automation.worker.js';
import { LifecycleConfigurationService } from './lifecycle-configuration.service.js';
import { LifecycleController } from './lifecycle.controller.js';
import { LifecycleInstanceService } from './lifecycle-instance.service.js';
import { LifecycleTaskService } from './lifecycle-task.service.js';

@Global()
@Module({
  imports: [PeopleModule, AuditModule],
  controllers: [LifecycleController, InboxController],
  providers: [
    InboxNotificationsService,
    InboxService,
    LifecycleConfigurationService,
    LifecycleInstanceService,
    LifecycleTaskService,
    LifecycleAutomationWorker,
    LifecycleRemindersService,
    { provide: INBOX_NOTIFICATIONS_PORT, useExisting: InboxNotificationsService },
  ],
  exports: [INBOX_NOTIFICATIONS_PORT],
})
export class LifecycleModule {}
