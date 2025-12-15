import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationGateway } from './notification.gateway';
import { Notification } from './entities/notification.entity';

interface ProofData {
  id: string;
  company: {
    name: string;
    email?: string;
    id?: string;
  };
  plan: {
    name: string;
  };
  imageUrl?: string;
  createdAt?: Date;
  decisionNote?: string;
}

interface CompanyData {
  name: string;
  email?: string;
  id?: string;
}

interface PlanData {
  name: string;
}

interface SubscriptionData {
  company: CompanyData;
  plan: PlanData;
  endDate?: Date;
  durationAdded?: number;
}

interface NotificationData {
  id?: string;
  title: string;
  message: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  companyName?: string;
  companyEmail?: string;
  planName?: string;
  imageUrl?: string;
  reason?: string;
  proofId?: string;
  endDate?: Date;
  durationAdded?: number;
  timestamp?: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  
  private readonly ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(Notification) 
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  private async saveNotification(
    userId: string, 
    userType: 'admin' | 'company', 
    title: string,
    message: string, 
    type: string, 
    priority: 'high' | 'medium' | 'low',
    data?: Record<string, unknown>
  ): Promise<Notification> {
    try {
      const finalUserId = userType === 'admin' ? this.ADMIN_USER_ID : userId;
      
      const notification = this.notificationRepo.create({
        userId: finalUserId,
        userType,
        title,
        message,
        type,
        priority,
        data
      });
      
      return await this.notificationRepo.save(notification);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل حفظ إشعار ${type}: ${errorMessage}`);
      throw error;
    }
  }

  async notifyAdmin(
    title: string, 
    message: string, 
    type: string, 
    priority: 'high' | 'medium' | 'low' = 'medium', 
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      const notification = await this.saveNotification(
        this.ADMIN_USER_ID, 
        'admin',
        title,
        message,
        type,
        priority,
        data
      );

      const notificationData: NotificationData = {
        id: notification.id,
        title,
        message,
        type,
        priority,
        ...data,
        timestamp: new Date(),
      };

      this.notificationGateway.sendToAllAdmins(type, notificationData);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إرسال إشعار للأدمن: ${errorMessage}`);
    }
  }

  async notifyCompany(
    companyId: string, 
    title: string, 
    message: string, 
    type: string, 
    priority: 'high' | 'medium' | 'low' = 'medium', 
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      const notification = await this.saveNotification(
        companyId,
        'company',
        title,
        message,
        type,
        priority,
        data
      );

      const notificationData: NotificationData = {
        id: notification.id,
        title,
        message,
        type,
        priority,
        ...data,
        timestamp: new Date(),
      };

      const sent = this.notificationGateway.sendToCompany(companyId, type, notificationData);

      if (!sent) {
        this.logger.error(`الشركة ${companyId} غير متصلة - الإشعار مخزن للعرض لاحقاً`);
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إرسال إشعار للشركة ${companyId}: ${errorMessage}`);
    }
  }

  async notifyNewSubscriptionRequest(proof: ProofData): Promise<void> {
    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      companyEmail: proof.company.email,
      planName: proof.plan.name,
      imageUrl: proof.imageUrl,
      proofId: proof.id
    };

    await this.notifyAdmin(
      'طلب اشتراك جديد',
      `طلب تفعيل اشتراك جديد من ${proof.company.name}`,
      'NEW_SUBSCRIPTION_REQUEST',
      'high',
      data
    );
  }

  async notifySubscriptionApproved(proof: ProofData): Promise<void> {
    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      planName: proof.plan.name,
      proofId: proof.id
    };

    await this.notifyAdmin(
      'تم تفعيل الاشتراك',
      `تم تفعيل اشتراك ${proof.company.name} بنجاح`,
      'SUBSCRIPTION_APPROVED',
      'medium',
      data
    );
  }

  async notifySubscriptionRejected(proof: ProofData): Promise<void> {
    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      planName: proof.plan.name,
      reason: proof.decisionNote,
      proofId: proof.id
    };

    await this.notifyAdmin(
      'تم رفض الاشتراك',
      `تم رفض طلب اشتراك ${proof.company.name}`,
      'SUBSCRIPTION_REJECTED',
      'medium',
      data
    );
  }

  async notifyPaymentSuccess(company: CompanyData, plan: PlanData): Promise<void> {
    const data: Record<string, unknown> = {
      companyName: company.name,
      companyEmail: company.email,
      planName: plan.name
    };

    await this.notifyAdmin(
      'دفع ناجح',
      `دفع ناجح من ${company.name} للخطة ${plan.name}`,
      'PAYMENT_SUCCESS',
      'medium',
      data
    );
  }

  async notifyNewCompanyRegistration(company: CompanyData): Promise<void> {
    const data: Record<string, unknown> = {
      companyName: company.name,
      companyEmail: company.email
    };

    await this.notifyAdmin(
      'شركة جديدة',
      `شركة جديدة مسجلة: ${company.name}`,
      'NEW_COMPANY_REGISTRATION',
      'medium',
      data
    );
  }

  async notifyCompanySubscriptionApproved(proof: ProofData): Promise<void> {
    if (!proof.company.id) {
      this.logger.error(`لا يمكن إرسال إشعار موافقة - company.id غير موجود`);
      return;
    }

    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      planName: proof.plan.name,
      proofId: proof.id
    };

    await this.notifyCompany(
      proof.company.id,
      'تم تفعيل الاشتراك ',
      `تم قبول طلب الاشتراك الخاص بك في الخطة ${proof.plan.name}`,
      'COMPANY_SUBSCRIPTION_APPROVED',
      'high',
      data
    );
  }

  async notifyCompanySubscriptionRejected(proof: ProofData): Promise<void> {
    if (!proof.company.id) {
      this.logger.error(`لا يمكن إرسال إشعار رفض - company.id غير موجود`);
      return;
    }

    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      planName: proof.plan.name,
      reason: proof.decisionNote,
      proofId: proof.id
    };

    await this.notifyCompany(
      proof.company.id,
      'تم رفض الاشتراك ',
      `تم رفض طلب الاشتراك في الخطة ${proof.plan.name}. السبب: ${proof.decisionNote}`,
      'COMPANY_SUBSCRIPTION_REJECTED',
      'high',
      data
    );
  }

  async notifyCompanySubscriptionExtended(subscription: SubscriptionData): Promise<void> {
    if (!subscription.company.id) {
      this.logger.error(`لا يمكن إرسال إشعار تمديد - company.id غير موجود`);
      return;
    }

    const data: Record<string, unknown> = {
      companyName: subscription.company.name,
      planName: subscription.plan.name,
      endDate: subscription.endDate,
      durationAdded: subscription.durationAdded
    };

    await this.notifyCompany(
      subscription.company.id,
      'تم تمديد الاشتراك',
      `تم تمديد اشتراكك في الخطة ${subscription.plan.name} بنجاح`,
      'COMPANY_SUBSCRIPTION_EXTENDED',
      'medium',
      data
    );
  }

  async notifyCompanySubscriptionCancelled(company: CompanyData): Promise<void> {
    if (!company.id) {
      this.logger.error(`لا يمكن إرسال إشعار إلغاء - company.id غير موجود`);
      return;
    }

    const data: Record<string, unknown> = {
      companyName: company.name
    };

    await this.notifyCompany(
      company.id,
      'تم إلغاء الاشتراك',
      `تم إلغاء اشتراكك. لم تعد قادراً على إضافة موظفين جدد.`,
      'COMPANY_SUBSCRIPTION_CANCELLED',
      'high',
      data
    );
  }

  async getAdminNotifications(): Promise<Notification[]> {
    return await this.notificationRepo.find({
      where: { 
        userType: 'admin',
        userId: this.ADMIN_USER_ID 
      },
      order: { createdAt: 'DESC' },
      take: 50 
    });
  }

  async getCompanyNotifications(companyId: string): Promise<Notification[]> {
    return await this.notificationRepo.find({
      where: { 
        userType: 'company',
        userId: companyId
      },
      order: { createdAt: 'DESC' },
      take: 50
    });
  }

  async getUnreadNotificationsCount(userId: string, userType: 'admin' | 'company'): Promise<number> {
    const finalUserId = userType === 'admin' ? this.ADMIN_USER_ID : userId;
    
    return await this.notificationRepo.count({
      where: { 
        userId: finalUserId,
        userType,
        isRead: false
      }
    });
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationRepo.update(notificationId, {
      isRead: true,
      readAt: new Date()
    });
  }

  async markAllAsRead(userId: string, userType: 'admin' | 'company'): Promise<void> {
    const finalUserId = userType === 'admin' ? this.ADMIN_USER_ID : userId;
    
    await this.notificationRepo.update(
      {
        userId: finalUserId,
        userType,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new NotFoundException(`الإشعار غير موجود: ${notificationId}`);
    }

    await this.notificationRepo.delete(notificationId);
  }

  async deleteAllUserNotifications(userId: string, userType: 'admin' | 'company'): Promise<{ deletedCount: number }> {
    const finalUserId = userType === 'admin' ? this.ADMIN_USER_ID : userId;
    
    const result = await this.notificationRepo.delete({
      userId: finalUserId,
      userType
    });
    
    return { deletedCount: result.affected || 0 };
  }

  async deleteReadNotifications(userId: string, userType: 'admin' | 'company'): Promise<{ deletedCount: number }> {
    const finalUserId = userType === 'admin' ? this.ADMIN_USER_ID : userId;
    
    const result = await this.notificationRepo.delete({
      userId: finalUserId,
      userType,
      isRead: true
    });
    
    return { deletedCount: result.affected || 0 };
  }

  async deleteOldNotifications(olderThanDays: number = 30): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.notificationRepo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();
    
    return { deletedCount: result.affected || 0 };
  }

  getConnectionStats() {
    return {
      connectedAdmins: this.notificationGateway.getConnectedAdminsCount(),
      connectedCompanies: this.notificationGateway.getConnectedCompaniesCount(),
    };
  }

  async sendTestNotification(companyId?: string): Promise<void> {
    const data: Record<string, unknown> = { 
      test: true, 
      timestamp: new Date() 
    };

    if (companyId) {
      await this.notifyCompany(
        companyId,
        'إشعار تجريبي',
        'هذا إشعار تجريبي للتحقق من عمل النظام',
        'TEST_NOTIFICATION',
        'low',
        data
      );
    } else {
      await this.notifyAdmin(
        'إشعار تجريبي',
        'هذا إشعار تجريبي للأدمن',
        'TEST_NOTIFICATION', 
        'low',
        data
      );
    }
  }
}