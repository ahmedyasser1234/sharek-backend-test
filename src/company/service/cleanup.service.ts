import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityTrackerService } from './activity-tracker.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly activityTracker: ActivityTrackerService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) 
  async cleanupInactiveSessions(): Promise<void> {
    try {
      await this.activityTracker.cleanupOldActivities();
    } catch (error) {
      this.logger.error(`فشل تنظيف الجلسات: ${error}`);
    }
  }
}