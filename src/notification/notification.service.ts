/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';

interface NotificationData {
  id?: string;
  companyName: string;
  companyEmail?: string;
  planName: string;
  imageUrl?: string;
  createdAt?: Date;
  reason?: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
}

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

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly notificationGateway: NotificationGateway) {}

  notifyNewSubscriptionRequest(proof: ProofData): void {
    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      companyEmail: proof.company.email,
      planName: proof.plan.name,
      imageUrl: proof.imageUrl,
      createdAt: proof.createdAt,
      message: `طلب تفعيل اشتراك جديد من ${proof.company.name}`,
      priority: 'high',
      type: 'NEW_SUBSCRIPTION_REQUEST'
    };
    this.notificationGateway.sendToAllAdmins('NEW_SUBSCRIPTION_REQUEST', notificationData);
  }

  notifySubscriptionApproved(proof: ProofData): void {
    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      planName: proof.plan.name,
      message: `تم تفعيل اشتراك ${proof.company.name} بنجاح`,
      priority: 'medium',
      type: 'SUBSCRIPTION_APPROVED'
    };
    this.notificationGateway.sendToAllAdmins('SUBSCRIPTION_APPROVED', notificationData);
  }

  notifySubscriptionRejected(proof: ProofData): void {
    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      planName: proof.plan.name,
      reason: proof.decisionNote,
      message: `تم رفض طلب اشتراك ${proof.company.name}`,
      priority: 'medium',
      type: 'SUBSCRIPTION_REJECTED'
    };
    this.notificationGateway.sendToAllAdmins('SUBSCRIPTION_REJECTED', notificationData);
  }

  notifyPaymentSuccess(company: CompanyData, plan: PlanData): void {
    const notificationData = {
      companyName: company.name,
      companyEmail: company.email,
      planName: plan.name,
      message: `دفع ناجح من ${company.name} للخطة ${plan.name}`,
      priority: 'medium',
      type: 'PAYMENT_SUCCESS'
    };
    this.notificationGateway.sendToAllAdmins('PAYMENT_SUCCESS', notificationData);
  }

  notifyNewCompanyRegistration(company: CompanyData): void {
    const notificationData = {
      companyName: company.name,
      companyEmail: company.email,
      message: `شركة جديدة مسجلة: ${company.name}`,
      priority: 'medium',
      planName: 'N/A',
      type: 'NEW_COMPANY_REGISTRATION'
    };
    this.notificationGateway.sendToAllAdmins('NEW_COMPANY_REGISTRATION', notificationData);
  }

  notifyCompanySubscriptionApproved(proof: ProofData): void {
    if (!proof.company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار موافقة - company.id غير موجود للشركة: ${proof.company.name}`);
      return;
    }

    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      planName: proof.plan.name,
      message: `تم قبول طلب الاشتراك الخاص بك في الخطة ${proof.plan.name}`,
      priority: 'high',
      type: 'COMPANY_SUBSCRIPTION_APPROVED'
    };
    this.notificationGateway.sendToCompany(proof.company.id, 'COMPANY_SUBSCRIPTION_APPROVED', notificationData);
  }

  notifyCompanySubscriptionRejected(proof: ProofData): void {
    if (!proof.company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار رفض - company.id غير موجود للشركة: ${proof.company.name}`);
      return;
    }

    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      planName: proof.plan.name,
      reason: proof.decisionNote,
      message: `تم رفض طلب الاشتراك في الخطة ${proof.plan.name}. السبب: ${proof.decisionNote}`,
      priority: 'high',
      type: 'COMPANY_SUBSCRIPTION_REJECTED'
    };
    this.notificationGateway.sendToCompany(proof.company.id, 'COMPANY_SUBSCRIPTION_REJECTED', notificationData);
  }

  notifyCompanySubscriptionExtended(subscription: SubscriptionData): void {
    if (!subscription.company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار تمديد - company.id غير موجود للشركة: ${subscription.company.name}`);
      return;
    }

    const notificationData = {
      companyName: subscription.company.name,
      planName: subscription.plan.name,
      endDate: subscription.endDate,
      durationAdded: subscription.durationAdded,
      message: `تم تمديد اشتراكك في الخطة ${subscription.plan.name} بنجاح`,
      priority: 'medium',
      type: 'COMPANY_SUBSCRIPTION_EXTENDED'
    };
    this.notificationGateway.sendToCompany(subscription.company.id, 'COMPANY_SUBSCRIPTION_EXTENDED', notificationData);
  }

  notifyCompanySubscriptionCancelled(company: CompanyData): void {
    if (!company.id) {
      this.logger.warn(`لا يمكن إرسال إشعار إلغاء - company.id غير موجود للشركة: ${company.name}`);
      return;
    }

    const notificationData = {
      companyName: company.name,
      message: `تم إلغاء اشتراكك. لم تعد قادراً على إضافة موظفين جدد.`,
      priority: 'high',
      type: 'COMPANY_SUBSCRIPTION_CANCELLED'
    };
    this.notificationGateway.sendToCompany(company.id, 'COMPANY_SUBSCRIPTION_CANCELLED', notificationData);
  }

  getConnectionStats() {
    return {
      connectedAdmins: this.notificationGateway.getConnectedAdminsCount(),
      connectedCompanies: this.notificationGateway.getConnectedCompaniesCount(),
    };
  }
}


