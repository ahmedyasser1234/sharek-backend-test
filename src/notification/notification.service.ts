import { Injectable, Logger } from '@nestjs/common';
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

  constructor(
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(Notification) 
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  // 🔥 دالة أساسية لحفظ الإشعارات
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
      const notification = this.notificationRepo.create({
        userId,
        userType,
        title,
        message,
        type,
        priority,
        data
      });
      
      const savedNotification = await this.notificationRepo.save(notification);
      this.logger.log(`✅ تم حفظ إشعار ${type} لـ ${userType}: ${userId}`);
      return savedNotification;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ فشل حفظ إشعار ${type}: ${errorMessage}`);
      throw error;
    }
  }

  // 🔥 إرسال إشعار للأدمن (متصل أو لا)
  async notifyAdmin(
    title: string, 
    message: string, 
    type: string, 
    priority: 'high' | 'medium' | 'low' = 'medium', 
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      // 1. حفظ الإشعار في الداتابيز
      const notification = await this.saveNotification(
        'admin-system', // معرف ثابت للأدمن
        'admin',
        title,
        message,
        type,
        priority,
        data
      );

      // 2. محاولة الإرسال للأدمن المتصلين
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
      this.logger.error(`❌ فشل إرسال إشعار للأدمن: ${errorMessage}`);
    }
  }

  // 🔥 إرسال إشعار للشركة (متصلة أو لا)
  async notifyCompany(
    companyId: string, 
    title: string, 
    message: string, 
    type: string, 
    priority: 'high' | 'medium' | 'low' = 'medium', 
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      // 1. حفظ الإشعار في الداتابيز
      const notification = await this.saveNotification(
        companyId,
        'company',
        title,
        message,
        type,
        priority,
        data
      );

      // 2. محاولة الإرسال للشركة إذا كانت متصلة
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
        this.logger.log(`📱 الشركة ${companyId} غير متصلة - الإشعار مخزن للعرض لاحقاً`);
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ فشل إرسال إشعار للشركة ${companyId}: ${errorMessage}`);
    }
  }

  // 🔥 الدوال الحالية بعد التعديل
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
      this.logger.warn(`لا يمكن إرسال إشعار موافقة - company.id غير موجود`);
      return;
    }

    const data: Record<string, unknown> = {
      companyName: proof.company.name,
      planName: proof.plan.name,
      proofId: proof.id
    };

    await this.notifyCompany(
      proof.company.id,
      'تم تفعيل الاشتراك',
      `تم قبول طلب الاشتراك الخاص بك في الخطة ${proof.plan.name}`,
      'COMPANY_SUBSCRIPTION_APPROVED',
      'high',
      data
    );
  }

  async notifyCompanySubscriptionRejected(proof: ProofData): Promise<void> {
    if (!proof.company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار رفض - company.id غير موجود`);
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
      'تم رفض الاشتراك',
      `تم رفض طلب الاشتراك في الخطة ${proof.plan.name}. السبب: ${proof.decisionNote}`,
      'COMPANY_SUBSCRIPTION_REJECTED',
      'high',
      data
    );
  }

  async notifyCompanySubscriptionExtended(subscription: SubscriptionData): Promise<void> {
    if (!subscription.company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار تمديد - company.id غير موجود`);
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
      this.logger.warn(`لا يمكن إرسال إشعار إلغاء - company.id غير موجود`);
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

  // 🔥 دوال جديدة لجلب الإشعارات
  async getAdminNotifications(): Promise<Notification[]> {
    return await this.notificationRepo.find({
      where: { userType: 'admin' },
      order: { createdAt: 'DESC' },
      take: 50 // آخر 50 إشعار
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
    return await this.notificationRepo.count({
      where: { 
        userId: userType === 'admin' ? 'admin-system' : userId,
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
    await this.notificationRepo.update(
      {
        userId: userType === 'admin' ? 'admin-system' : userId,
        userType,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
  }

  getConnectionStats() {
    return {
      connectedAdmins: this.notificationGateway.getConnectedAdminsCount(),
      connectedCompanies: this.notificationGateway.getConnectedCompaniesCount(),
    };
  }

  // 🔥 دالة لاختبار النظام
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