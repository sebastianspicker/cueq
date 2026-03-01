import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Phase2Service } from './phase2.service';

@Injectable()
export class ClosingCutoffService {
  private readonly logger = new Logger(ClosingCutoffService.name);

  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyCutoff() {
    const result = await this.phase2Service.runClosingCutoff(new Date());
    if (result.transitioned > 0) {
      this.logger.log(`Transitioned ${result.transitioned} closing period(s) to REVIEW.`);
    }
  }
}
