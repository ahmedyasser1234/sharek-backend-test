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
}

interface ProofData {
  id: string;
  company: {
    name: string;
    email?: string;
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
}

interface PlanData {
  name: string;
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
      priority: 'high'
    };
    this.notificationGateway.sendToAllAdmins('NEW_SUBSCRIPTION_REQUEST', notificationData);
  }

  notifySubscriptionApproved(proof: ProofData): void {
    const notificationData = {
      id: proof.id,
      companyName: proof.company.name,
      planName: proof.plan.name,
      message: `تم تفعيل اشتراك ${proof.company.name} بنجاح`,
      priority: 'medium'
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
      priority: 'medium'
    };
    this.notificationGateway.sendToAllAdmins('SUBSCRIPTION_REJECTED', notificationData);
  }

  notifyPaymentSuccess(company: CompanyData, plan: PlanData): void {
    const notificationData = {
      companyName: company.name,
      companyEmail: company.email,
      planName: plan.name,
      message: `دفع ناجح من ${company.name} للخطة ${plan.name}`,
      priority: 'medium'
    };
    this.notificationGateway.sendToAllAdmins('PAYMENT_SUCCESS', notificationData);
  }

  notifyNewCompanyRegistration(company: CompanyData): void {
    const notificationData = {
      companyName: company.name,
      companyEmail: company.email,
      message: `شركة جديدة مسجلة: ${company.name}`,
      priority: 'medium',
      planName: 'N/A'
    };
    this.notificationGateway.sendToAllAdmins('NEW_COMPANY_REGISTRATION', notificationData);
  }

  getConnectionStats() {
    return {
      connectedAdmins: this.notificationGateway.getConnectedAdminsCount(),
    };
  }
}