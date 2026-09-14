import { EmploymentConfigurationService } from './employment-configuration.service.js';
import { EmploymentManagementService } from './employment-management.service.js';
import { EmploymentManagementController } from './employment-management.controller.js';
import { PersonnelReconciliationService } from './personnel-reconciliation.service.js';
import { ProfileChangesService } from './profile-changes.service.js';
import { PersonnelQueryService } from './personnel-query.service.js';
import { PersonnelReconciliationController } from './personnel-reconciliation.controller.js';
import { PersonnelController } from './personnel.controller.js';
/** Personnel resolution and directory API surface. */
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { Module } from '@nestjs/common';
import { PersonHelper } from './person.helper.js';
import { PersonsController } from './persons.controller.js';
import { AssignmentHelper } from './assignment.helper.js';
import { CapabilityHelper } from './capability.helper.js';
import { CapabilitiesController } from './capabilities.controller.js';
import { AssignmentContextController } from './assignment-context.controller.js';

@Module({
  imports: [TransactionsModule],
  controllers: [
    EmploymentManagementController,
    PersonnelController,
    PersonnelReconciliationController,
    PersonsController,
    CapabilitiesController,
    AssignmentContextController,
  ],
  providers: [
    EmploymentManagementService,
    EmploymentConfigurationService,
    PersonnelQueryService,
    ProfileChangesService,
    PersonnelReconciliationService,
    PersonHelper,
    AssignmentHelper,
    CapabilityHelper,
  ],
  exports: [PersonHelper, AssignmentHelper, CapabilityHelper],
})
export class PeopleModule {}
