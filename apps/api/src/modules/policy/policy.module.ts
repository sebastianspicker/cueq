/** Policy configuration and threshold evaluation API surface. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { PoliciesController } from './policies.controller.js';
import { PolicyQueryService } from './policy-query.service.js';
import { TimeThresholdPolicyHelper } from './time-threshold-policy.helper.js';
import { TimeThresholdsController } from './time-thresholds.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [PoliciesController, TimeThresholdsController],
  providers: [PolicyQueryService, TimeThresholdPolicyHelper],
  exports: [PolicyQueryService, TimeThresholdPolicyHelper],
})
export class PolicyModule {}
