import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { CompanyActivity } from '../entities/company-activity.entity';

@Injectable()
export class ActivityTrackerService {
  private readonly logger = new Logger(ActivityTrackerService.name);
  private readonly INACTIVITY_THRESHOLD = 30 * 60 * 1000; 

  constructor(
    @InjectRepository(CompanyActivity)
    private readonly activityRepo: Repository<CompanyActivity>,
  ) {}

  async recordActivity(companyId: string, action: string): Promise<void> {
    try {
      let activity = await this.activityRepo.findOne({
        where: { companyId }
      });

      const now = new Date();
      
      if (activity) {
        activity.lastActivity = now;
        activity.action = action;
        activity.isOnline = true;
      } else {
        activity = this.activityRepo.create({
          companyId,
          lastActivity: now,
          action,
          isOnline: true
        });
      }

      await this.activityRepo.save(activity);
      this.logger.debug(` تم تسجيل نشاط للشركة ${companyId}: ${action}`);
    } catch (error) {
      this.logger.error(` فشل تسجيل النشاط للشركة ${companyId}: ${error}`);
    }
  }

  async checkInactivity(companyId: string): Promise<boolean> {
    try {
      const activity = await this.activityRepo.findOne({
        where: { companyId }
      });

      if (!activity) {
        this.logger.debug(` لا توجد سجلات نشاط للشركة ${companyId}`);
        return false; 
      }

      const now = Date.now();
      const lastActivityTime = activity.lastActivity.getTime();
      const inactivityPeriod = now - lastActivityTime;

      this.logger.debug(` التحقق من النشاط للشركة ${companyId}: ${inactivityPeriod}ms منذ آخر نشاط`);

      const isInactive = inactivityPeriod > this.INACTIVITY_THRESHOLD;
      
      if (isInactive) {
        this.logger.warn(` الشركة ${companyId} غير نشطة لمدة ${Math.round(inactivityPeriod / 60000)} دقيقة`);
      }

      return isInactive;
    } catch (error) {
      this.logger.error(` خطأ في التحقق من النشاط للشركة ${companyId}: ${error}`);
      return false; 
    }
  }

  async markAsOffline(companyId: string): Promise<void> {
    try {
      await this.activityRepo.update(
        { companyId },
        { isOnline: false, lastActivity: new Date() }
      );
      this.logger.debug(` تم تعيين الشركة ${companyId} كغير متصل`);
    } catch (error) {
      this.logger.error(` فشل تعيين حالة غير متصل للشركة ${companyId}: ${error}`);
    }
  }

  async markAsOnline(companyId: string): Promise<void> {
    try {
      await this.recordActivity(companyId, 'login');
      this.logger.debug(` تم تعيين الشركة ${companyId} كمتصل`);
    } catch (error) {
      this.logger.error(` فشل تعيين حالة متصل للشركة ${companyId}: ${error}`);
    }
  }

  async getActiveSessions(): Promise<CompanyActivity[]> {
    try {
      const threshold = new Date(Date.now() - this.INACTIVITY_THRESHOLD);
      return await this.activityRepo.find({
        where: {
          lastActivity: MoreThan(threshold),
          isOnline: true
        }
      });
    } catch (error) {
      this.logger.error(` فشل جلب الجلسات النشطة: ${error}`);
      return [];
    }
  }

  async cleanupOldActivities(): Promise<number> {
    try {
      const threshold = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); 
      const result = await this.activityRepo
        .createQueryBuilder()
        .delete()
        .where('lastActivity < :threshold', { threshold })
        .execute();

      this.logger.log(` تم تنظيف ${result.affected} سجل نشاط قديم`);
      return result.affected || 0;
    } catch (error) {
      this.logger.error(` فشل تنظيف سجلات النشاط القديمة: ${error}`);
      return 0;
    }
  }
}