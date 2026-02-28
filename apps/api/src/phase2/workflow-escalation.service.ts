import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkflowRuntimeService } from './workflow-runtime.service';

@Injectable()
export class WorkflowEscalationService {
  private readonly logger = new Logger(WorkflowEscalationService.name);

  constructor(
    @Inject(WorkflowRuntimeService) private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyEscalation() {
    const result = await this.workflowRuntimeService.escalateOverdueWorkflows(new Date());
    if (result.escalated > 0) {
      this.logger.log(`Escalated ${result.escalated} overdue workflow(s).`);
    }
  }
}
