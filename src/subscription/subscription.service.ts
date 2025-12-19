import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  CompanySubscription,
  SubscriptionStatus,
} from './entities/company-subscription.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from '../plan/entities/plan.entity';
import { CompanyService } from '../company/company.service';
import { PaymentService } from '../payment/payment.service';
import * as nodemailer from 'nodemailer';
import { Cron } from '@nestjs/schedule';
import { Employee } from '../employee/entities/employee.entity'; 
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { PaymentProofStatus } from '../payment/entities/payment-proof-status.enum';
import { Admin } from '../admin/entities/admin.entity';
import { Manager } from '../admin/entities/manager.entity';

export interface SubscriptionResponse {
  message: string;
  redirectToDashboard?: boolean;
  redirectToPayment?: boolean;
  checkoutUrl?: string;
  subscription?: CompanySubscription;
}

export interface CancelSubscriptionResult {
  message: string;
  cancelledSubscriptions: number;
  companyStatus: string;
  note: string;
}

export interface ExtendSubscriptionResult {
  message: string;
  subscription: CompanySubscription;
  warning?: string;
  details?: {
    currentEmployees: number;
    maxAllowed: number;
    exceededBy?: number;
    remainingSlots?: number;
    newEndDate: Date;
    planStatus: string;
    planName: string;
    durationAdded: string;
    daysRemainingBefore: number;
    daysRemainingAfter: number;
    totalDaysAdded: number;
  };
}

export interface PlanChangeValidation {
  canChange: boolean;
  message: string;
  currentPlanMax: number;
  newPlanMax: number;
  currentEmployees: number;
  action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID';
}

export interface PlanChangeRequestResult {
  success: boolean;
  message: string;
  validation: PlanChangeValidation;
  changeDetails?: {
    currentPlan: string;
    newPlan: string;
    currentMaxEmployees: number;
    newMaxEmployees: number;
    currentEmployees: number;
    daysRemaining: number;
    newDuration: number;
    price: number;
    action: string;
  };
}

export interface PlanChangeResult {
  message: string;
  subscription: CompanySubscription;
  details: {
    action: string;
    oldPlan: string;
    newPlan: string;
    currentEmployees: number;
    oldMaxAllowed: number;
    newMaxAllowed: number;
    daysRemaining: number;
    newDuration: number;
    newEndDate: Date;
    employeeLimitUpdated: boolean;
  };
}

export interface UpgradeCheckResult {
  canUpgrade: boolean;
  reason?: string;
  currentPlan?: Plan;
  newPlan?: Plan;
  isSamePlan?: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(CompanySubscription)
    private readonly subscriptionRepo: Repository<CompanySubscription>,
    
    @InjectRepository(Company)
    public readonly companyRepo: Repository<Company>,
    
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    
    @InjectRepository(PaymentProof) 
    private readonly paymentProofRepo: Repository<PaymentProof>,
    
    @InjectRepository(Admin) 
    private readonly adminRepo: Repository<Admin>,

    @InjectRepository(Manager) 
    private readonly sellerRepo: Repository<Manager>,
    
    private readonly companyService: CompanyService,
    private readonly paymentService: PaymentService,
  ) {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter(): void {
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(` فشل إرسال الإيميل:`, error);
    }
  }

  private async sendSubscriptionActionEmail(
    companyEmail: string,
    companyName: string,
    adminEmail: string,
    planName: string,
    action: 'created' | 'renewed' | 'cancelled' | 'extended' | 'changed',
    details: string
  ): Promise<void> {
    try {
      const actionText = {
        'created': 'تم إنشاء اشتراك جديد',
        'renewed': 'تم تجديد الاشتراك',
        'cancelled': 'تم إلغاء الاشتراك',
        'extended': 'تم تمديد الاشتراك',
        'changed': 'تم تغيير الخطة'
      };

      const actionColor = {
        'created': '#28a745',
        'renewed': '#007bff',
        'cancelled': '#dc3545',
        'extended': '#ffc107',
        'changed': '#17a2b8'
      };

      const subject = `تحديث اشتراك - ${companyName}`;
      
      const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body {
              font-family: 'Arial', 'Segoe UI', sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: ${actionColor[action]};
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .content {
              background-color: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .info-box {
              background-color: #f8f9fa;
              border-right: 4px solid ${actionColor[action]};
              padding: 20px;
              margin-bottom: 20px;
              border-radius: 8px;
            }
            .info-box p {
              margin: 10px 0;
              font-size: 16px;
            }
            .info-box strong {
              color: #333;
              margin-left: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #777;
              font-size: 14px;
            }
            .company-info {
              background-color: #f0f7ff;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
              text-align: center;
            }
            .company-info h3 {
              color: #007bff;
              margin-bottom: 10px;
            }
            .action-details {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .details-title {
              color: #856404;
              font-weight: bold;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${actionText[action]}</h1>
            </div>
            
            <div class="content">
              <div class="info-box">

              <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>البريد الإلكتروني:</strong> ${companyEmail}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>تاريخ الإجراء:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>بواسطة الأدمن:</strong> ${adminEmail}</p>
              </div>
              
              <div class="action-details">
                <div class="details-title">تفاصيل الإجراء:</div>
                <p>${details}</p>
              </div>
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(companyEmail, subject, html);
    } catch (error) {
      this.logger.error(` فشل إرسال إيميل الإجراء ${action}:`, error);
    }
  }
private isAllowedPlanChange(
  currentPlanMax: number,
  newPlanMax: number
): { allowed: boolean; reason?: string } {

  const currentMax = Number(currentPlanMax) || 0;
  const newMax = Number(newPlanMax) || 0;

  if (newMax < currentMax) {
    return {
      allowed: false,
      reason: `غير مسموح النزول من ${currentMax} موظف إلى ${newMax} موظف`
    };
  }

  return { allowed: true };
}


  private async deactivateOldSubscriptions(companyId: string): Promise<{ deactivatedCount: number }> {
    try {
      const oldActiveSubscriptions = await this.subscriptionRepo.find({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (oldActiveSubscriptions.length > 0) {
        let deactivatedCount = 0;
        
        for (const sub of oldActiveSubscriptions) {
          if (sub.status === SubscriptionStatus.ACTIVE) {
            sub.status = SubscriptionStatus.EXPIRED;
            await this.subscriptionRepo.save(sub);
            deactivatedCount++;
          }
        }
        
        return {
          deactivatedCount
        };
      }
      
      return { deactivatedCount: 0 };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل إلغاء تفعيل الاشتراكات القديمة للشركة ${companyId}: ${errorMessage}`);
      return { deactivatedCount: 0 };
    }
  }

  async getPlans(): Promise<Plan[]> {
    try {
      return await this.planRepo.find();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('فشل جلب الخطط', errorMessage);
      throw new InternalServerErrorException('فشل جلب الخطط');
    }
  }

  async subscribe(
    companyId: string, 
    planId: string, 
    isAdminOverride = false,
    activatedBySellerId?: string,
    activatedByAdminId?: string,
    activatedBySupadminId?: string,
    activatorEmail?: string  
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.log(`[subscribe] === بدء الاشتراك ===`);
      this.logger.log(`[subscribe] companyId: ${companyId}, planId: ${planId}`);
      this.logger.log(`[subscribe] isAdminOverride: ${isAdminOverride}`);
      this.logger.log(`[subscribe] activatorEmail: ${activatorEmail}`);

      const company = await this.companyRepo.findOne({ 
        where: { id: companyId },
        relations: ['subscriptions'] 
      });
      if (!company) throw new NotFoundException('الشركة غير موجودة');

      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      if (!newPlan) throw new NotFoundException('الخطة غير موجودة');

      this.logger.debug(`[subscribe] الخطة الجديدة: ${newPlan.name} - ${newPlan.maxEmployees} موظف - ${newPlan.price} ريال`);

      const planPrice = parseFloat(String(newPlan.price));
      if (isNaN(planPrice)) throw new BadRequestException('السعر غير صالح للخطة');

      if (newPlan.isTrial) {
        const previousTrial = await this.subscriptionRepo.findOne({
          where: {
            company: { id: companyId },
            plan: { isTrial: true },
            status: SubscriptionStatus.ACTIVE
          },
          relations: ['plan'],
        });
        if (previousTrial) {
          throw new BadRequestException('لا يمكن استخدام الخطة التجريبية أكثر من مرة');
        }
      }

      const existingActiveSubscription = await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE,
          endDate: MoreThanOrEqual(new Date())
        },
        relations: ['plan']
      });

      if (existingActiveSubscription && existingActiveSubscription.plan && !isAdminOverride) {
        const currentPlan = existingActiveSubscription.plan;
        const currentPlanMax = Number(currentPlan.maxEmployees) || 0;
        const currentPlanPrice = Number(currentPlan.price) || 0;
        const newPlanMax = Number(newPlan.maxEmployees) || 0;
        const newPlanPrice = Number(newPlan.price) || 0;

        this.logger.debug(`[subscribe] الخطة الحالية: ${currentPlan.name} - ${currentPlanMax} موظف - ${currentPlanPrice} ريال`);
        this.logger.debug(`[subscribe] الخطة الجديدة: ${newPlan.name} - ${newPlanMax} موظف - ${newPlanPrice} ريال`);

       const check = this.isAllowedPlanChange(
  currentPlanMax,
  newPlanMax
);

        
        if (!check.allowed) {
          this.logger.error(`[subscribe] ممنوع: ${check.reason}`);
          throw new BadRequestException(
            `لا يمكن الاشتراك في خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) ` +
            `لأنك مشترك حالياً في خطة ${currentPlan.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) - ` +
            check.reason
          );
        }

        const currentEmployees = await this.employeeRepo.count({
          where: { company: { id: companyId } }
        });
        
        if (currentEmployees > newPlanMax) {
          throw new BadRequestException(
            `لا يمكن الاشتراك في خطة ${newPlan.name} لأنها تدعم فقط ${newPlanMax} موظف ` +
            `بينما لديك حالياً ${currentEmployees} موظف`
          );
        }
      }

      let isNewSubscription = false;
      let action: 'created' | 'renewed' | 'changed' = 'created';
      let savedSubscription: CompanySubscription;
      let finalMessage = '';

      if (existingActiveSubscription) {
        const isSamePlan = existingActiveSubscription.plan?.id === newPlan.id;
        
        if (isSamePlan) {
          action = 'renewed';
          finalMessage = 'تم تجديد الاشتراك بنجاح';
        } else {
          action = 'changed';
          finalMessage = 'تم تحديث الاشتراك بنجاح';
        }
        
        if (!isSamePlan) {
          existingActiveSubscription.plan = newPlan;
          existingActiveSubscription.customMaxEmployees = newPlan.maxEmployees;
        }
        
        existingActiveSubscription.price = planPrice;
        
        const newEndDate = new Date(existingActiveSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        existingActiveSubscription.endDate = newEndDate;
        
        if (activatedBySellerId) {
          existingActiveSubscription.activatedBySellerId = activatedBySellerId;
          this.logger.log(`[subscribe] تم تعيين activatedBySellerId: ${activatedBySellerId}`);
        }
        
        if (activatedByAdminId) {
          existingActiveSubscription.activatedByAdminId = activatedByAdminId;
          this.logger.log(`[subscribe] تم تعيين activatedByAdminId: ${activatedByAdminId}`);
        }

        if (activatedBySupadminId) {
          existingActiveSubscription.activatedBySupadminId = activatedBySupadminId;
          this.logger.log(`[subscribe] تم تعيين activatedBySupadminId: ${activatedBySupadminId}`);
        }

        savedSubscription = await this.subscriptionRepo.save(existingActiveSubscription);

        await this.companyRepo
          .createQueryBuilder()
          .update(Company)
          .set({
            subscriptionStatus: 'active',
            planId: newPlan.id,
            paymentProvider: newPlan.paymentProvider?.toString() ?? '',
            subscribedAt: () => 'CURRENT_TIMESTAMP'
          })
          .where('id = :id', { id: companyId })
          .execute();

        if (isAdminOverride) {
          await this.updateRelatedPaymentProof(companyId, planId);
        }

        if (planPrice === 0) {
          finalMessage = 'تم تحديث الاشتراك إلى الخطة المجانية بنجاح';
        } else if (newPlan.isTrial) {
          finalMessage = 'تم تحديث الاشتراك إلى الخطة التجريبية بنجاح';
        } else if (isAdminOverride) {
          finalMessage = 'تم تحديث الاشتراك يدويًا بواسطة الإدارة';
        }

      } else {
        isNewSubscription = true;
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + newPlan.durationInDays);

        const subscriptionData: Partial<CompanySubscription> = {
          company,
          plan: newPlan,
          startDate,
          endDate,
          price: planPrice,
          status: SubscriptionStatus.ACTIVE,
          customMaxEmployees: newPlan.maxEmployees,
        };

        if (activatedBySellerId) {
          subscriptionData.activatedBySellerId = activatedBySellerId;
          this.logger.log(`[subscribe] New subscription - تم تعيين activatedBySellerId: ${activatedBySellerId}`);
          
          try {
            const seller = await this.sellerRepo.findOne({ 
              where: { id: activatedBySellerId } 
            });
            if (seller) {
              subscriptionData.activatedBySeller = seller;
            }
          } catch (error) {
            this.logger.warn(`[subscribe] لم يتم العثور على البائع ${activatedBySellerId}: ${error}`);
          }
        }
        
        if (activatedByAdminId) {
          subscriptionData.activatedByAdminId = activatedByAdminId;
          this.logger.log(`[subscribe] New subscription - تم تعيين activatedByAdminId: ${activatedByAdminId}`);
        }

        if (activatedBySupadminId) {
          subscriptionData.activatedBySupadminId = activatedBySupadminId;
          this.logger.log(`[subscribe] New subscription - تم تعيين activatedBySupadminId: ${activatedBySupadminId}`);
        }

        const subscription = this.subscriptionRepo.create(subscriptionData);
        savedSubscription = await this.subscriptionRepo.save(subscription);

        await this.companyRepo
          .createQueryBuilder()
          .update(Company)
          .set({
            subscriptionStatus: 'active',
            planId: newPlan.id,
            paymentProvider: newPlan.paymentProvider?.toString() ?? '',
            subscribedAt: () => 'CURRENT_TIMESTAMP'
          })
          .where('id = :id', { id: companyId })
          .execute();

        if (isAdminOverride) {
          await this.updateRelatedPaymentProof(companyId, planId);
        }

        if (planPrice === 0) {
          finalMessage = 'تم الاشتراك في الخطة المجانية بنجاح';
        } else if (newPlan.isTrial) {
          finalMessage = 'تم الاشتراك في الخطة التجريبية بنجاح';
        } else if (isAdminOverride) {
          finalMessage = 'تم تفعيل الاشتراك يدويًا بواسطة الإدارة';
        }
      }

      if (isAdminOverride && activatorEmail) {
        this.logger.log(`[subscribe] سأرسل إيميل: isAdminOverride=${isAdminOverride}, activatorEmail=${activatorEmail}`);
        
        const endDateStr = savedSubscription.endDate.toLocaleDateString('ar-SA');
        let details = '';
        let emailAction = action;
        
        if (isNewSubscription) {
          details = `تم إنشاء اشتراك جديد في خطة "${newPlan.name}". السعر: ${planPrice} ريال. المدة: ${newPlan.durationInDays} يوم. تاريخ الانتهاء: ${endDateStr}.`;
          emailAction = 'created';
        } else if (action === 'renewed') {
          details = `تم تجديد اشتراكك في خطة "${newPlan.name}" لمدة ${newPlan.durationInDays} يوم إضافية. تاريخ الانتهاء الجديد: ${endDateStr}.`;
          emailAction = 'renewed';
        } else {
          const oldPlanName = existingActiveSubscription?.plan?.name || 'غير معروفة';
          details = `تم تغيير اشتراكك من خطة "${oldPlanName}" إلى خطة "${newPlan.name}". السعر: ${planPrice} ريال. المدة: ${newPlan.durationInDays} يوم. تاريخ الانتهاء الجديد: ${endDateStr}.`;
          emailAction = 'changed';
        }
        
        this.logger.log(`[subscribe] إرسال إيميل إلى ${company.email}`);
        this.logger.log(`[subscribe] من: ${activatorEmail}`);
        this.logger.log(`[subscribe] الإجراء: ${emailAction}`);
        
        await this.sendSubscriptionActionEmail(
          company.email,
          company.name,
          activatorEmail,
          newPlan.name,
          emailAction,
          details
        );
        
        this.logger.log(`[subscribe] تم إرسال الإيميل بنجاح`);
      } else {
        this.logger.warn(`[subscribe] لم يتم إرسال إيميل - isAdminOverride: ${isAdminOverride}, activatorEmail: ${activatorEmail}`);
      }

      if (planPrice > 0 && !isAdminOverride && isNewSubscription) {
        const provider = newPlan.paymentProvider;
        if (!provider) {
          throw new BadRequestException('مزود الدفع مطلوب للخطط المدفوعة');
        }

        const checkoutUrl = await this.paymentService.generateCheckoutUrl(
          provider,
          newPlan,
          companyId,
        );

        return {
          message: 'يتطلب إتمام عملية الدفع',
          redirectToPayment: true,
          checkoutUrl,
        };
      }

      return {
        message: finalMessage,
        redirectToDashboard: true,
        subscription: savedSubscription,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
      this.logger.error(`فشل الاشتراك للشركة ${companyId}: ${errorMessage}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل في عملية الاشتراك');
    }
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string, adminEmail?: string): Promise<PlanChangeResult> {
    try {
      const validation = await this.validatePlanChange(companyId, newPlanId);
      
      if (!validation.canChange) {
        throw new BadRequestException(validation.message);
      }

      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      
      if (!currentSubscription || !newPlan) {
        throw new NotFoundException('الاشتراك أو الخطة غير موجودة');
      }

      const currentPlanPrice = Number(currentSubscription.plan?.price) || 0;
      const newPlanPrice = Number(newPlan.price) || 0;
      const currentPlanMax = Number(currentSubscription.plan?.maxEmployees) || 0;
      const newPlanMax = Number(newPlan.maxEmployees) || 0;
      
   const check = this.isAllowedPlanChange(
  currentPlanMax,
  newPlanMax
);

      
      if (!check.allowed) {
        throw new BadRequestException(
          `غير مسموح بالانتقال من خطة ${currentSubscription.plan?.name} ` +
          `(${currentPlanMax} موظف - ${currentPlanPrice} ريال) ` +
          `إلى خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) - ` +
          check.reason
        );
      }

      const isSamePlan = 
        currentSubscription.plan?.id === newPlan.id ||
        (newPlanMax === currentPlanMax && newPlanPrice === currentPlanPrice);
      
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlan.price;
      currentSubscription.customMaxEmployees = newPlan.maxEmployees;
      
      if (isSamePlan) {
        const newEndDate = new Date(currentSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
      } else {
        currentSubscription.startDate = new Date();
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
      }

      const updatedSubscription = await this.subscriptionRepo.save(currentSubscription);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          planId: newPlan.id
        })
        .where('id = :id', { id: companyId })
        .execute();

      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (company && adminEmail) {
        const newEndDateStr = updatedSubscription.endDate.toLocaleDateString('ar-SA');
        const details = isSamePlan 
          ? `تم تجديد اشتراكك في خطة "${newPlan.name}" لمدة ${newPlan.durationInDays} يوم إضافية. تاريخ الانتهاء الجديد: ${newEndDateStr}.`
          : `تم تغيير اشتراكك من خطة "${currentSubscription.plan?.name}" إلى خطة "${newPlan.name}". السعر: ${newPlanPrice} ريال. المدة: ${newPlan.durationInDays} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
        
        await this.sendSubscriptionActionEmail(
          company.email,
          company.name,
          adminEmail,
          newPlan.name,
          isSamePlan ? 'renewed' : 'changed',
          details
        );
      }

      return { 
        message: isSamePlan ? 'تم تجديد الاشتراك بنجاح' : 'تم تغيير الخطة بنجاح', 
        subscription: updatedSubscription,
        details: {
          action: validation.action,
          oldPlan: currentSubscription.plan?.name || 'غير معروف',
          newPlan: newPlan.name,
          currentEmployees: validation.currentEmployees,
          oldMaxAllowed: validation.currentPlanMax,
          newMaxAllowed: newPlan.maxEmployees,
          daysRemaining: 0,
          newDuration: newPlan.durationInDays,
          newEndDate: updatedSubscription.endDate,
          employeeLimitUpdated: newPlan.maxEmployees > validation.currentPlanMax
        }
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تغيير الخطة للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async changePlanDirectly(companyId: string, newPlanId: string, adminOverride = false, adminEmail?: string): Promise<PlanChangeResult> {
    try {
      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      if (!newPlan) {
        throw new NotFoundException('الخطة غير موجودة');
      }

      if (!currentSubscription) {
        const subscriptionResult = await this.subscribe(companyId, newPlanId, true, undefined, undefined, undefined, adminEmail);
        
        const newSubscription = subscriptionResult.subscription;
        
        if (!newSubscription) {
          throw new BadRequestException('فشل إنشاء الاشتراك الجديد');
        }
        
        const currentEmployees = await this.employeeRepo.count({
          where: { company: { id: companyId } }
        });
        
        return {
          message: 'تم إنشاء وتفعيل الاشتراك الجديد بنجاح',
          subscription: newSubscription,
          details: {
            action: 'NEW_SUBSCRIPTION',
            oldPlan: 'لا يوجد اشتراك سابق',
            newPlan: newPlan.name,
            currentEmployees,
            oldMaxAllowed: 0,
            newMaxAllowed: newPlan.maxEmployees,
            daysRemaining: 0,
            newDuration: newPlan.durationInDays,
            newEndDate: newSubscription.endDate,
            employeeLimitUpdated: true
          }
        };
      }

      const currentPlan = currentSubscription.plan;
      const currentPlanMax = Number(currentPlan?.maxEmployees) || 0;
      const currentPlanPrice = Number(currentPlan?.price) || 0;
      const newPlanMax = Number(newPlan.maxEmployees) || 0;
      const newPlanPrice = Number(newPlan.price) || 0;

      this.logger.debug(`[changePlanDirectly] مقارنة: ${currentPlanMax} موظف - ${currentPlanPrice} ريال -> ${newPlanMax} موظف - ${newPlanPrice} ريال`);

    const check = this.isAllowedPlanChange(
  currentPlanMax,
  newPlanMax
);

      if (!check.allowed && !adminOverride) {
        throw new BadRequestException(
          `غير مسموح بالانتقال إلى خطة أقل. ` +
          `الخطة الحالية: ${currentPlan?.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) ` +
          `الخطة الجديدة: ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) - ` +
          check.reason
        );
      }

      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });
      
      if (currentEmployees > newPlanMax && !adminOverride) {
        throw new BadRequestException(
          `لا يمكن الانتقال إلى الخطة ${newPlan.name} لأنها تدعم فقط ${newPlanMax} موظف ` +
          `بينما لديك حالياً ${currentEmployees} موظف`
        );
      }
      
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlan.price;
      currentSubscription.customMaxEmployees = newPlan.maxEmployees;
      currentSubscription.status = SubscriptionStatus.ACTIVE;
      
      const isSamePlan = newPlan.id === currentPlan?.id;
      
      if (isSamePlan) {
        const newEndDate = new Date(currentSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
      } else {
        currentSubscription.startDate = new Date();
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
      }
      
      const updatedSubscription = await this.subscriptionRepo.save(currentSubscription);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          planId: newPlan.id,
          subscriptionStatus: 'active',
          subscribedAt: () => 'CURRENT_TIMESTAMP',
          paymentProvider: newPlan.paymentProvider?.toString() || 'manual'
        })
        .where('id = :id', { id: companyId })
        .execute();

      if (adminOverride) {
        await this.updateRelatedPaymentProof(companyId, newPlanId);
      }
      
      const message = isSamePlan ? 'تم تجديد الاشتراك بنجاح' : 'تم تغيير الخطة بنجاح';
      
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (company && adminEmail) {
        const newEndDateStr = updatedSubscription.endDate.toLocaleDateString('ar-SA');
        const details = isSamePlan 
          ? `تم تجديد اشتراكك في خطة "${newPlan.name}" لمدة ${newPlan.durationInDays} يوم إضافية. تاريخ الانتهاء الجديد: ${newEndDateStr}.`
          : `تم تغيير اشتراكك من خطة "${currentPlan?.name}" إلى خطة "${newPlan.name}". السعر: ${newPlanPrice} ريال. المدة: ${newPlan.durationInDays} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
        
        await this.sendSubscriptionActionEmail(
          company.email,
          company.name,
          adminEmail,
          newPlan.name,
          isSamePlan ? 'renewed' : 'changed',
          details
        );
      }
      
      return {
        message: message,
        subscription: updatedSubscription,
        details: {
          action: isSamePlan ? 'RENEW' : (newPlanMax > currentPlanMax || newPlanPrice > currentPlanPrice ? 'UPGRADE' : 'CHANGE'),
          oldPlan: currentPlan?.name || 'غير معروف',
          newPlan: newPlan.name,
          currentEmployees,
          oldMaxAllowed: currentPlanMax,
          newMaxAllowed: newPlanMax,
          daysRemaining: 0,
          newDuration: newPlan.durationInDays,
          newEndDate: updatedSubscription.endDate,
          employeeLimitUpdated: newPlanMax > currentPlanMax
        }
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تغيير الخطة: ${errorMessage}`);
      throw error;
    }
  }

  async requestPlanChange(companyId: string, newPlanId: string): Promise<PlanChangeRequestResult> {
    try {
      const validation = await this.validatePlanChange(companyId, newPlanId);
      
      if (!validation.canChange) {
        return {
          success: false,
          message: validation.message,
          validation: validation
        };
      }

      if (validation.action === 'DOWNGRADE') {
        return {
          success: false,
          message: `غير مسموح بالانتقال من خطة أعلى إلى خطة أقل سواء في عدد الموظفين أو السعر`,
          validation: validation
        };
      }

      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });

      if (!currentSubscription || !newPlan) {
        throw new NotFoundException('الاشتراك أو الخطة غير موجودة');
      }

      const now = new Date();
      const endDate = new Date(currentSubscription.endDate);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const newDurationInDays = daysRemaining + 365;

      return {
        success: true,
        message: validation.message,
        validation: validation,
        changeDetails: {
          currentPlan: currentSubscription.plan?.name || 'غير معروف',
          newPlan: newPlan.name,
          currentMaxEmployees: validation.currentPlanMax,
          newMaxEmployees: validation.newPlanMax,
          currentEmployees: validation.currentEmployees,
          daysRemaining: daysRemaining,
          newDuration: newDurationInDays,
          price: newPlan.price,
          action: validation.action
        }
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل طلب تغيير الخطة للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  private async updateRelatedPaymentProof(companyId: string, planId: string): Promise<void> {
    try {
      const latestProof = await this.paymentProofRepo.findOne({
        where: { 
          company: { id: companyId },
          plan: { id: planId },
          status: PaymentProofStatus.PENDING 
        },
        order: { createdAt: 'DESC' },
        relations: ['company', 'plan'],
      });
      
      if (latestProof) {
        latestProof.status = PaymentProofStatus.APPROVED;
        latestProof.reviewed = true;
        latestProof.rejected = false;
        await this.paymentProofRepo.save(latestProof);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تحديث حالة إثبات الدفع: ${errorMessage}`);
    }
  }

  private async validateCompanySubscription(companyId: string): Promise<{activeSubscription: CompanySubscription | null}> {
    const company = await this.companyRepo.findOne({ 
      where: { id: companyId },
      relations: ['subscriptions', 'subscriptions.plan']
    });
    
    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    const activeSubscription = company.subscriptions?.find(
      sub => sub.status === SubscriptionStatus.ACTIVE && new Date(sub.endDate) > new Date()
    ) || null;

    return { activeSubscription };
  }

  async updateCompanyEmployeeLimit(companyId: string, newLimit: number): Promise<any> {
    try {
      const subscription = await this.getCompanySubscription(companyId);
      if (!subscription) throw new NotFoundException('لا يوجد اشتراك للشركة');

      subscription.customMaxEmployees = newLimit;
      await this.subscriptionRepo.save(subscription);

      return {
        message: `تم تعديل الحد المسموح للموظفين إلى ${newLimit}`,
        subscription,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تعديل الحد للموظفين للشركة ${companyId}: ${msg}`);
      throw new InternalServerErrorException('فشل تعديل الحد للموظفين');
    }
  }
  
  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    try {
      const subscription = await this.subscriptionRepo
        .createQueryBuilder('sub')
        .leftJoinAndSelect('sub.plan', 'plan')
        .leftJoinAndSelect('sub.activatedBySeller', 'activatedBySeller')
        .leftJoinAndSelect('sub.activatedByAdmin', 'activatedByAdmin')
        .leftJoin('sub.company', 'company')
        .where('company.id = :companyId', { companyId })
        .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('sub.endDate > :now', { now: new Date() })
        .orderBy('sub.startDate', 'DESC')
        .getOne();

      if (!subscription) {
        await this.syncCompanySubscriptionStatus(companyId);
        
        return await this.subscriptionRepo
          .createQueryBuilder('sub')
          .leftJoinAndSelect('sub.plan', 'plan')
          .leftJoinAndSelect('sub.activatedBySeller', 'activatedBySeller')
          .leftJoinAndSelect('sub.activatedByAdmin', 'activatedByAdmin')
          .leftJoin('sub.company', 'company')
          .where('company.id = :companyId', { companyId })
          .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
          .andWhere('sub.endDate > :now', { now: new Date() })
          .orderBy('sub.startDate', 'DESC')
          .getOne();
      }

      return subscription;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الاشتراك للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('Failed to get subscription');
    }
  }

  async getAllowedEmployees(companyId: string): Promise<{ maxAllowed: number; remaining: number; current: number }> {
    try {
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        return { maxAllowed: 0, remaining: 0, current: 0 };
      }

      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const maxAllowed = activeSubscription.customMaxEmployees ?? activeSubscription.plan?.maxEmployees ?? 0;
      const remaining = Math.max(0, maxAllowed - currentEmployees);

      return { 
        maxAllowed, 
        remaining, 
        current: currentEmployees 
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل حساب الحد المسموح للموظفين للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حساب الحد المسموح للموظفين');
    }
  }

  async canAddEmployee(companyId: string): Promise<{ canAdd: boolean; allowed: number; current: number; maxAllowed: number }> {
    try {
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        return { canAdd: false, allowed: 0, current: 0, maxAllowed: 0 };
      }

      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const maxAllowed = activeSubscription.customMaxEmployees ?? activeSubscription.plan?.maxEmployees ?? 0;
      const remaining = Math.max(0, maxAllowed - currentEmployees);
      const canAdd = remaining > 0;

      return { 
        canAdd, 
        allowed: remaining, 
        current: currentEmployees, 
        maxAllowed 
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل التحقق من إمكانية إضافة موظف: ${errorMessage}`);
      throw new InternalServerErrorException('فشل التحقق من إمكانية إضافة موظف');
    }
  }

  async getUsage(companyId: string): Promise<any> {
    try {
      const { canAdd, allowed, current, maxAllowed } = await this.canAddEmployee(companyId);
      const subscription = await this.getCompanySubscription(companyId);
      const now = new Date();
      const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;

      return {
        allowed: allowed,        
        current,                 
        maxAllowed,             
        remaining: allowed,      
        canAdd,                  
        currentSubscription: subscription,
        isExpired,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل حساب استخدام الشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حساب الاستخدام');
    }
  }

  async cancelSubscription(
    companyId: string, 
    adminId?: string,
    adminEmail?: string,
    reason?: string
  ): Promise<CancelSubscriptionResult> {
    try {
      const { deactivatedCount } = await this.deactivateOldSubscriptions(companyId);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          subscriptionStatus: 'inactive',
          planId: () => 'NULL',
          paymentProvider: '',
          subscribedAt: () => 'NULL'
        })
        .where('id = :id', { id: companyId })
        .execute();

      const company = await this.companyRepo.findOne({ 
        where: { id: companyId },
        relations: ['subscriptions', 'subscriptions.plan']
      });
      
      if (company) {
        const latestSubscription = company.subscriptions?.sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        )[0];
        
        const planName = latestSubscription?.plan?.name || 'غير معروف';
        
        if (adminEmail) {
          const details = reason 
            ? `تم إلغاء اشتراك الشركة من قبل الإدارة. السبب: ${reason}. لن تتمكن الشركة من إضافة موظفين جدد حتى تشترك في خطة جديدة.`
            : `تم إلغاء اشتراك الشركة من قبل الإدارة. لن تتمكن الشركة من إضافة موظفين جدد حتى تشترك في خطة جديدة.`;
          
          await this.sendSubscriptionActionEmail(
            company.email,
            company.name,
            adminEmail,
            planName,
            'cancelled',
            details
          );
        }
      }

      const result: CancelSubscriptionResult = { 
        message: 'تم إلغاء جميع اشتراكات الشركة بنجاح', 
        cancelledSubscriptions: deactivatedCount,
        companyStatus: 'inactive - غير قادرة على إضافة موظفين',
        note: 'الشركة لن تتمكن من إضافة موظفين جدد حتى تشترك في خطة جديدة. يمكن استرجاع الاشتراكات السابقة من سجل الاشتراكات.'
      };

      return result;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل إلغاء الاشتراكات للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  async extendSubscription(
    companyId: string, 
    adminId?: string,
    adminEmail?: string,
    extraDays: number = 365
  ): Promise<ExtendSubscriptionResult> {
    try {
      const { activeSubscription } = await this.validateCompanySubscription(companyId);
      
      if (!activeSubscription) {
        throw new NotFoundException('لا يوجد اشتراك نشط للتمديد');
      }

      const allowedEmployees = await this.getAllowedEmployees(companyId);
      const currentEmployeeCount = allowedEmployees.current;
      const maxAllowed = allowedEmployees.maxAllowed;

      if (currentEmployeeCount > maxAllowed) {
        throw new BadRequestException(
          `لا يمكن تمديد الاشتراك - عدد الموظفين الحاليين (${currentEmployeeCount}) ` +
          `يتجاوز الحد المسموح (${maxAllowed})`
        );
      }

      const now = new Date();
      const endDate = new Date(activeSubscription.endDate);
      const daysRemainingBefore = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      const newEndDate = new Date(activeSubscription.endDate);
      newEndDate.setDate(newEndDate.getDate() + extraDays); 
      
      const totalDaysAdded = extraDays;
      
      const daysRemainingAfter = daysRemainingBefore + totalDaysAdded;
      
      activeSubscription.endDate = newEndDate;
      
      const updatedSubscription = await this.subscriptionRepo.save(activeSubscription);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          subscriptionStatus: 'active',
          planId: activeSubscription.plan.id,
          subscribedAt: () => 'CURRENT_TIMESTAMP'
        })
        .where('id = :id', { id: companyId })
        .execute();

      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (company && adminEmail) {
        const newEndDateStr = newEndDate.toLocaleDateString('ar-SA');
        const details = `تم تمديد اشتراكك في خطة "${activeSubscription.plan.name}" لمدة ${extraDays} يوم إضافية. الأيام المتبقية السابقة: ${daysRemainingBefore} يوم. الأيام المتبقية الجديدة: ${daysRemainingAfter} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
        
        await this.sendSubscriptionActionEmail(
          company.email,
          company.name,
          adminEmail,
          activeSubscription.plan.name,
          'extended',
          details
        );
      }

      const result: ExtendSubscriptionResult = { 
        message: `تم تمديد الاشتراك بنجاح لمدة ${extraDays} يوم إضافية`, 
        subscription: updatedSubscription,
        details: {
          currentEmployees: currentEmployeeCount,
          maxAllowed: maxAllowed,
          remainingSlots: maxAllowed - currentEmployeeCount,
          newEndDate: updatedSubscription.endDate,
          planStatus: `الخطة الحالية (${maxAllowed} موظف) ${maxAllowed === currentEmployeeCount ? 'مساوية' : 'أعلى'} من عدد الموظفين الحاليين`,
          planName: activeSubscription.plan.name,
          durationAdded: `${totalDaysAdded} يوم`,
          daysRemainingBefore: daysRemainingBefore,
          daysRemainingAfter: daysRemainingAfter,
          totalDaysAdded: totalDaysAdded
        }
      };
      return result;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تجديد الاشتراك للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async validatePlanChange(companyId: string, newPlanId: string): Promise<PlanChangeValidation> {
    try {
      const currentSubscription = await this.getCompanySubscription(companyId);
      
      if (!currentSubscription) {
        const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
        if (!newPlan) {
          throw new NotFoundException('الخطة الجديدة غير موجودة');
        }
        
        const currentEmployees = await this.employeeRepo.count({
          where: { company: { id: companyId } }
        });
        
        const canChange = newPlan.maxEmployees >= currentEmployees;
        const action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID' = 'UPGRADE';
        
        let message = '';
        if (canChange) {
          message = `يمكنك الاشتراك في الخطة ${newPlan.name} التي تدعم ${newPlan.maxEmployees} موظف`;
        } else {
          message = `لا يمكن الاشتراك في الخطة ${newPlan.name} (${newPlan.maxEmployees} موظف) لأن لديك ${currentEmployees} موظف`;
        }
        
        return {
          canChange,
          message,
          currentPlanMax: 0,
          newPlanMax: newPlan.maxEmployees,
          currentEmployees,
          action
        };
      }
      
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      if (!newPlan) {
        throw new NotFoundException('الخطة الجديدة غير موجودة');
      }
      
      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const currentPlanMax = Number(currentSubscription.plan?.maxEmployees) || 0;
      const newPlanMax = Number(newPlan.maxEmployees) || 0;
      const currentPlanPrice = Number(currentSubscription.plan?.price) || 0;
      const newPlanPrice = Number(newPlan.price) || 0;

      let action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID';
      let message = '';

      // 1. نفس الخطة
      if (newPlanMax === currentPlanMax && newPlanPrice === currentPlanPrice) {
        action = 'RENEW';
        message = `يمكنك التجديد في نفس الخطة ${newPlan.name}`;
      }
      // 2. نزول واضح (أقل في كلا المعيارين)
      else if (newPlanMax < currentPlanMax && newPlanPrice < currentPlanPrice) {
        action = 'DOWNGRADE';
        message = `غير مسموح بالانتقال من خطة ${currentSubscription.plan?.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) إلى خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) - غير مسموح بالانتقال لخطة أقل`;
        return {
          canChange: false,
          message,
          currentPlanMax,
          newPlanMax,
          currentEmployees,
          action
        };
      }
      // 3. ترقية (أعلى في واحد على الأقل من المعيارين ولا أقل في أي معيار)
      else if ((newPlanMax > currentPlanMax && newPlanPrice >= currentPlanPrice) ||
               (newPlanMax >= currentPlanMax && newPlanPrice > currentPlanPrice)) {
        action = 'UPGRADE';
        message = `يمكنك الترقية إلى الخطة ${newPlan.name} التي تدعم ${newPlanMax} موظف بسعر ${newPlanPrice} ريال`;
      }
      // 4. نزول جزئي (أقل في أحد المعيارين)
      else if (newPlanMax < currentPlanMax || newPlanPrice < currentPlanPrice) {
        action = 'DOWNGRADE';
        const reason = newPlanMax < currentPlanMax ? 'عدد الموظفين' : 'السعر';
        message = `غير مسموح بالانتقال إلى خطة ${newPlan.name} لأنها أقل في ${reason}. ` +
                 `(الحالية: ${currentPlanMax} موظف - ${currentPlanPrice} ريال, ` +
                 `الجديدة: ${newPlanMax} موظف - ${newPlanPrice} ريال)`;
        return {
          canChange: false,
          message,
          currentPlanMax,
          newPlanMax,
          currentEmployees,
          action
        };
      }
      // 5. حالة متساوية في أحد المعيارين والأعلى في الآخر (مسموح)
      else {
        action = 'UPGRADE';
        message = `يمكنك التغيير إلى الخطة ${newPlan.name} التي تدعم ${newPlanMax} موظف بسعر ${newPlanPrice} ريال`;
      }

      // تحقق من عدد الموظفين الحاليين
      if (currentEmployees > newPlanMax) {
        return {
          canChange: false,
          message: `لا يمكن الانتقال إلى الخطة ${newPlan.name} لأنها تدعم فقط ${newPlanMax} موظف بينما لديك حالياً ${currentEmployees} موظف`,
          currentPlanMax,
          newPlanMax,
          currentEmployees,
          action: action === 'UPGRADE' ? 'UPGRADE' : action
        };
      }

      const canChange = action === 'UPGRADE' || action === 'RENEW';
      const result: PlanChangeValidation = {
        canChange,
        message,
        currentPlanMax,
        newPlanMax,
        currentEmployees,
        action
      };

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل التحقق من تغيير الخطة: ${errorMessage}`);
      throw error;
    }
  }

  async canUpgradeToPlan(companyId: string, planId: string): Promise<UpgradeCheckResult> {
    try {
      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      
      if (!newPlan) {
        return { canUpgrade: false, reason: 'الخطة غير موجودة' };
      }

      if (!currentSubscription) {
        return { 
          canUpgrade: true, 
          reason: 'يمكن الاشتراك في هذه الخطة',
          newPlan 
        };
      }

      const currentPlan = currentSubscription.plan;
      
      if (currentPlan.id === newPlan.id) {
        return { 
          canUpgrade: true, 
          isSamePlan: true,
          reason: 'نفس الخطة - يمكن التجديد',
          currentPlan,
          newPlan 
        };
      }

      const currentPlanMax = Number(currentPlan.maxEmployees) || 0;
      const newPlanMax = Number(newPlan.maxEmployees) || 0;
 

  const check = this.isAllowedPlanChange(
  currentPlanMax,
  newPlanMax
);

      if (!check.allowed) {
        return { 
          canUpgrade: false, 
          reason: `لا يمكن النزول إلى خطة أقل. الخطة الحالية: ${currentPlan.name} (${currentPlan.maxEmployees} موظف - ${currentPlan.price} ريال)`,
          currentPlan,
          newPlan
        };
      }

      return { 
        canUpgrade: true, 
        reason: 'يمكن الترقية إلى هذه الخطة',
        currentPlan,
        newPlan
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل التحقق من الترقية: ${errorMessage}`);
      return { canUpgrade: false, reason: 'خطأ في التحقق' };
    }
  }

  async getAvailableUpgrades(companyId: string): Promise<Plan[]> {
    try {
      const allPlans = await this.planRepo.find();
      const currentSubscription = await this.getCompanySubscription(companyId);
      
      if (!currentSubscription) {
        return allPlans.sort((a, b) => a.maxEmployees - b.maxEmployees);
      }
      
      const currentPlan = currentSubscription.plan;
      const currentPlanMax = Number(currentPlan.maxEmployees) || 0;
      
const availablePlans = allPlans.filter(plan => {
  const planMax = Number(plan.maxEmployees) || 0;

  const check = this.isAllowedPlanChange(
    currentPlanMax,
    planMax
  );

  return check.allowed;
});

      return availablePlans.sort((a, b) => a.maxEmployees - b.maxEmployees);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الخطط المتاحة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب الخطط المتاحة');
    }
  }

  async getExpiringSubscriptions(daysThreshold: number = 30): Promise<CompanySubscription[]> {
    try {
      const now = new Date();
      const thresholdDate = new Date(now.getTime() + daysThreshold * 86400000);

      const subscriptions = await this.subscriptionRepo
        .createQueryBuilder('sub')
        .leftJoinAndSelect('sub.company', 'company')
        .leftJoinAndSelect('sub.plan', 'plan')
        .leftJoinAndSelect('sub.activatedBySeller', 'activatedBySeller')
        .leftJoinAndSelect('sub.activatedByAdmin', 'activatedByAdmin')
        .where('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('sub.endDate <= :thresholdDate', { thresholdDate })
        .orderBy('sub.endDate', 'ASC')
        .getMany();

      return subscriptions;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الاشتراكات القريبة من الانتهاء: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب الاشتراكات القريبة من الانتهاء');
    }
  }

  async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
    try {
      const subscriptions = await this.subscriptionRepo.find({
        where: { company: { id: companyId } },
        relations: ['plan', 'paymentTransaction', 'activatedBySeller', 'activatedByAdmin'],
        order: { startDate: 'DESC' },
      });

      return subscriptions;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب سجل الاشتراكات للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  async overrideEmployeeLimit(companyId: string, newMaxEmployees: number): Promise<void> {
    const activeSubscriptions = await this.subscriptionRepo.find({
      where: {
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE,
        endDate: MoreThanOrEqual(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (activeSubscriptions.length === 0) {
      throw new NotFoundException('لا توجد اشتراكات نشطة للشركة');
    }

    const subscription = activeSubscriptions[0];
    subscription.customMaxEmployees = newMaxEmployees;
    
    await this.subscriptionRepo.save(subscription);
  }

  async autoUpgradeEmployeeLimit(companyId: string, upgradePercentage: number = 50): Promise<void> {
    const activeSubscriptions = await this.subscriptionRepo.find({
      where: {
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE,
        endDate: MoreThanOrEqual(new Date()),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (activeSubscriptions.length === 0) {
      throw new NotFoundException('لا توجد اشتراكات نشطة للشركة');
    }

    const subscription = activeSubscriptions[0];
    const baseMax = subscription.plan.maxEmployees;
    const currentMax = subscription.customMaxEmployees || baseMax;
    
    const newMax = Math.ceil(currentMax * (1 + upgradePercentage / 100));
    
    subscription.customMaxEmployees = newMax;
    await this.subscriptionRepo.save(subscription);
  }

  @Cron('0 9 * * *')
  async notifyExpiringSubscriptions(): Promise<void> {
    try {
      const subscriptions = await this.subscriptionRepo.find({
        where: { status: SubscriptionStatus.ACTIVE },
        relations: ['company', 'plan'],
      });

      const now = new Date();

      for (const sub of subscriptions) {
        const endDate = new Date(sub.endDate);
        const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (![7, 14, 21, 30].includes(diffDays)) continue;

        const companyEmail = sub.company.email;
        const companyName = sub.company.name;
        const planName = sub.plan.name;

        const renewalUrl = this.generateRenewalUrl(
          sub.company.id,
          sub.plan.id,
          endDate,
          sub.plan.durationInDays,
        );

        const subject = `تنبيه: اشتراكك ينتهي بعد ${diffDays} يوم`;
        const message = `مرحبًا ${companyName}, اشتراكك في خطة "${planName}" سينتهي في ${endDate.toDateString()}.\n\nيمكنك التجديد الآن عبر الرابط التالي:\n${renewalUrl}`;

        try {
          await this.sendEmail(companyEmail, subject, message);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(`فشل إرسال التنبيه إلى ${companyEmail}: ${errorMessage}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل فحص الاشتراكات القريبة من الانتهاء: ${errorMessage}`);
    }
  }

  private generateRenewalUrl(companyId: string, planId: string, currentEndDate: Date, durationInDays: number): string {
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + durationInDays);
    const formattedDate = newEndDate.toISOString().split('T')[0];
    return `https://sharik-sa.com/renew-subscription?companyId=${companyId}&planId=${planId}&newEndDate=${formattedDate}`;
  }

  async getCurrentEmployeeCount(companyId: string): Promise<number> {
    try {
      const count = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });
      return count;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب عدد الموظفين للشركة ${companyId}: ${errorMessage}`);
      return 0;
    }
  }

  async syncCompanySubscriptionStatus(companyId: string): Promise<void> {
    try {
      const activeSubscriptions = await this.subscriptionRepo.find({
        where: {
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE,
          endDate: MoreThanOrEqual(new Date())
        },
        relations: ['plan'],
        order: { startDate: 'DESC' }
      });

      const company = await this.companyRepo.findOne({ 
        where: { id: companyId }
      });

      if (!company) {
        return;
      }

      if (activeSubscriptions.length > 0) {
        const latestSubscription = activeSubscriptions[0];
        
        if (company.subscriptionStatus !== 'active' || company.planId !== latestSubscription.plan.id) {
          await this.companyRepo
            .createQueryBuilder()
            .update(Company)
            .set({
              subscriptionStatus: 'active',
              planId: latestSubscription.plan.id,
              subscribedAt: () => 'CURRENT_TIMESTAMP',
              paymentProvider: latestSubscription.plan.paymentProvider?.toString() || 'manual_transfer'
            })
            .where('id = :id', { id: companyId })
            .execute();
        }
      } else {
        if (company.subscriptionStatus === 'active') {
          await this.companyRepo
            .createQueryBuilder()
            .update(Company)
            .set({
              subscriptionStatus: 'inactive',
              planId: () => 'NULL',
              subscribedAt: () => 'NULL',
              paymentProvider: ''
            })
            .where('id = :id', { id: companyId })
            .execute();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل مزامنة حالة الاشتراك للشركة ${companyId}: ${errorMessage}`);
    }
  }

  async hasActiveSubscription(companyId: string): Promise<boolean> {
    try {
      const subscription = await this.getCompanySubscription(companyId);
      const hasActive = !!subscription;
      return hasActive;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل التحقق من وجود اشتراك نشط للشركة ${companyId}: ${errorMessage}`);
      return false;
    }
  }

  async debugSubscriptionStatus(companyId: string): Promise<any> {
    try {
      const company = await this.companyRepo.findOne({ 
        where: { id: companyId },
        relations: ['subscriptions', 'subscriptions.plan']
      });

      if (!company) {
        return { error: 'Company not found' };
      }

      const allSubscriptions = await this.subscriptionRepo.find({
        where: { company: { id: companyId } },
        relations: ['plan'],
        order: { startDate: 'DESC' }
      });

      const activeSubscriptions = allSubscriptions.filter(
        sub => sub.status === SubscriptionStatus.ACTIVE && new Date(sub.endDate) > new Date()
      );

      const result = {
        company: {
          id: company.id,
          subscriptionStatus: company.subscriptionStatus,
          planId: company.planId,
          subscribedAt: company.subscribedAt
        },
        allSubscriptions: allSubscriptions.map(sub => ({
          id: sub.id,
          plan: sub.plan?.name,
          status: sub.status,
          startDate: sub.startDate,
          endDate: sub.endDate,
          customMaxEmployees: sub.customMaxEmployees,
          isActive: sub.status === SubscriptionStatus.ACTIVE && new Date(sub.endDate) > new Date()
        })),
        activeSubscriptions: activeSubscriptions.map(sub => ({
          id: sub.id,
          plan: sub.plan?.name,
          startDate: sub.startDate,
          endDate: sub.endDate,
          customMaxEmployees: sub.customMaxEmployees
        })),
        syncNeeded: activeSubscriptions.length > 0 && company.subscriptionStatus !== 'active'
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تصحيح حالة الاشتراك للشركة ${companyId}: ${errorMessage}`);
      return { error: 'Debug failed' };
    }
  }

  async getAdminEmail(adminId: string): Promise<string | undefined> {
    try {
      const admin = await this.adminRepo.findOne({ 
        where: { id: adminId },
        select: ['email']
      });
      
      return admin?.email;
    } catch (error) {
      this.logger.error(`فشل الحصول على بريد الأدمن ${adminId}: ${error}`);
      return undefined;
    }
  }

  // دالة مساعدة للتصحيح فقط
  async debugPlanComparison(companyId: string, newPlanId: string): Promise<any> {
    try {
      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      
      if (!newPlan) {
        return { error: 'الخطة الجديدة غير موجودة' };
      }
      
      if (!currentSubscription) {
        return { 
          message: 'لا يوجد اشتراك حالي',
          newPlan: {
            name: newPlan.name,
            maxEmployees: newPlan.maxEmployees,
            price: newPlan.price
          }
        };
      }
      
      const currentPlan = currentSubscription.plan;
      const currentPlanMax = Number(currentPlan.maxEmployees) || 0;
      const currentPlanPrice = Number(currentPlan.price) || 0;
      const newPlanMax = Number(newPlan.maxEmployees) || 0;
      const newPlanPrice = Number(newPlan.price) || 0;
      
    const check = this.isAllowedPlanChange(
  currentPlanMax,
  newPlanMax
);

      return {
        currentPlan: {
          name: currentPlan.name,
          maxEmployees: currentPlan.maxEmployees,
          price: currentPlan.price,
          parsed: { max: currentPlanMax, price: currentPlanPrice }
        },
        newPlan: {
          name: newPlan.name,
          maxEmployees: newPlan.maxEmployees,
          price: newPlan.price,
          parsed: { max: newPlanMax, price: newPlanPrice }
        },
        comparison: {
          allowed: check.allowed,
          reason: check.reason,
          employeeComparison: `${newPlanMax} ${newPlanMax < currentPlanMax ? '<' : (newPlanMax > currentPlanMax ? '>' : '=')} ${currentPlanMax}`,
          priceComparison: `${newPlanPrice} ${newPlanPrice < currentPlanPrice ? '<' : (newPlanPrice > currentPlanPrice ? '>' : '=')} ${currentPlanPrice}`
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { error: errorMessage };
    }
  }
}