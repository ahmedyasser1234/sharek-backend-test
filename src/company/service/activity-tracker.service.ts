import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyActivity } from '../entities/company-activity.entity';

@Injectable()
export class ActivityTrackerService {
  private readonly logger = new Logger(ActivityTrackerService.name);
  private readonly INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; 

  constructor(
    @InjectRepository(CompanyActivity)
    private readonly activityRepo: Repository<CompanyActivity>,
  ) {}

  async recordActivity(companyId: string, action: string): Promise<void> {
    try {
      let activity = await this.activityRepo.findOne({
        where: { companyId }
      });

      if (activity) {
        activity.lastActivity = new Date();
        activity.action = action;
        activity.isOnline = true;
        await this.activityRepo.save(activity);
      } else {
        activity = this.activityRepo.create({
          companyId,
          lastActivity: new Date(),
          action,
          isOnline: true,
        });
        await this.activityRepo.save(activity);
      }
      
      this.logger.debug(` تم تسجيل نشاط للشركة: ${companyId} - ${action}`);
    } catch (error: unknown) {
      this.logger.error(` فشل تسجيل النشاط: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async checkInactivity(companyId: string): Promise<boolean> {
    try {
      const activity = await this.activityRepo.findOne({
        where: { companyId }
      });

      if (!activity || !activity.lastActivity) {
        return false; 
      }

      const now = new Date();
      const lastActivityTime = new Date(activity.lastActivity).getTime();
      const currentTime = now.getTime();
      const timeDiff = currentTime - lastActivityTime;

      const shouldLogout = timeDiff > this.INACTIVITY_TIMEOUT;
      
      if (shouldLogout) {
        this.logger.warn(` الشركة ${companyId} انتهت جلستها بسبب عدم النشاط`);
      }
      
      return shouldLogout;
    } catch (error) {
      this.logger.error(` خطأ في التحقق من النشاط: ${error}`);
      return false;
    }
  }

  async markAsOffline(companyId: string): Promise<void> {
    try {
      await this.activityRepo.update(
        { companyId },
        { isOnline: false }
      );
      this.logger.debug(` تم تعيين الشركة ${companyId} كغير متصل`);
    } catch (error) {
      this.logger.error(` فشل تعيين حالة غير متصل: ${error}`);
    }
  }

  async getLastActivity(companyId: string): Promise<Date | null> {
    const activity = await this.activityRepo.findOne({
      where: { companyId }
    });
    return activity?.lastActivity || null;
  }

  async cleanupOldActivities(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); 
      const result = await this.activityRepo
        .createQueryBuilder()
        .delete()
        .where('lastActivity < :cutoffTime', { cutoffTime })
        .execute();
      
      this.logger.log(` تم تنظيف ${result.affected} سجل نشاط قديم`);
    } catch (error) {
      this.logger.error(` فشل تنظيف السجلات القديمة: ${error}`);
    }
  }
}