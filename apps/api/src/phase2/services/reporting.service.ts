/** Injectable compatibility provider for reporting views and custom report previews. */
import { Inject, Injectable } from '@nestjs/common';
import { ReportingAnalyticsHelper } from '../helpers/reporting-analytics.helper.js';
import { ReportingComplianceHelper } from '../helpers/reporting-compliance.helper.js';
import { ReportingFacade } from './reporting-facade.service.js';

@Injectable()
export class ReportingService extends ReportingFacade {
  // prettier-ignore
  constructor(@Inject(ReportingComplianceHelper) complianceHelper: ReportingComplianceHelper, @Inject(ReportingAnalyticsHelper) analyticsHelper: ReportingAnalyticsHelper) { super({ complianceHelper, analyticsHelper }); }
}
