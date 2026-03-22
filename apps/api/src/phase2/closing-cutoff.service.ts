import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClosingDomainService } from './services/closing-domain.service';

@Injectable()
export class ClosingCutoffService {
  private readonly logger = new Logger(ClosingCutoffService.name);

  constructor(
    @Inject(ClosingDomainService) private readonly closingService: ClosingDomainService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyCutoff() {
    try {
      const result = await this.closingService.runClosingCutoff(new Date());
      if (result.transitioned > 0) {
        this.logger.log(`Transitioned ${result.transitioned} closing period(s) to REVIEW.`);
      }
    } catch (error) {
      this.logger.error(
        `Hourly closing cutoff failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
