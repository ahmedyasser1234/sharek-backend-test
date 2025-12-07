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
    
    private readonly companyService: CompanyService,
    private readonly paymentService: PaymentService,
  ) {}

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
            this.logger.log(` تم إلغاء تفعيل الاشتراك ${sub.id} للشركة ${companyId}`);
          }
        }
        
        this.logger.log(` تم إلغاء تفعيل ${deactivatedCount} اشتراك قديم للشركة ${companyId}`);
        
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
    activatedByAdminId?: string
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.log(`[subscribe] بدء الاشتراك: الشركة ${companyId} في الخطة ${planId}`);

      const company = await this.companyRepo.findOne({ 
        where: { id: companyId },
        relations: ['subscriptions'] 
      });
      if (!company) throw new NotFoundException('الشركة غير موجودة');

      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      if (!newPlan) throw new NotFoundException('الخطة غير موجودة');

      const planPrice = parseFloat(String(newPlan.price));
      if (isNaN(planPrice)) throw new BadRequestException('السعر غير صالح للخطة');

      // التحقق من الخطة التجريبية
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

      // التحقق من الاشتراك النشط الحالي
      const existingActiveSubscription = await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE,
          endDate: MoreThanOrEqual(new Date())
        },
        relations: ['plan']
      });

      // ✅ التحقق المحسن: السماح دائمًا بالترقية أو نفس الخطة، منع النزول فقط
      if (existingActiveSubscription && existingActiveSubscription.plan && !isAdminOverride) {
        const currentPlan = existingActiveSubscription.plan;
        const currentPlanMax = currentPlan.maxEmployees;
        const currentPlanPrice = currentPlan.price;
        const newPlanMax = newPlan.maxEmployees;
        const newPlanPrice = newPlan.price;

        // ✅ منع النزول للخطة الأقل فقط (أقل في كلا الجانبين)
        const isDowngrading = newPlanMax < currentPlanMax && newPlanPrice < currentPlanPrice;
        const isPartialDowngrade = (newPlanMax < currentPlanMax && newPlanPrice >= currentPlanPrice) ||
                                   (newPlanMax >= currentPlanMax && newPlanPrice < currentPlanPrice);
        
        if (isDowngrading) {
          throw new BadRequestException(
            `لا يمكن الاشتراك في خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) ` +
            `لأنك مشترك حالياً في خطة ${currentPlan.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) - ` +
            `غير مسموح بالنزول لخطة أقل`
          );
        }
        
        if (isPartialDowngrade) {
          const reason = newPlanMax < currentPlanMax ? 'عدد الموظفين' : 'السعر';
          throw new BadRequestException(
            `لا يمكن الاشتراك في خطة ${newPlan.name} لأنها أقل في ${reason}`
          );
        }
        
        // ✅ السماح إذا كانت نفس الخطة (للتجديد)
        if (newPlanMax === currentPlanMax && newPlanPrice === currentPlanPrice) {
          this.logger.log(`[subscribe] الشركة ${companyId} تطلب التجديد في نفس الخطة`);
        }
        
        // ✅ السماح إذا كانت الخطة الجديدة أكبر
        if (newPlanMax > currentPlanMax || newPlanPrice > currentPlanPrice) {
          this.logger.log(`[subscribe] الشركة ${companyId} تطلب الترقية من ${currentPlan.name} إلى ${newPlan.name}`);
        }
      }

      // إذا كان هناك اشتراك نشط موجود
      if (existingActiveSubscription) {
        this.logger.log(`[subscribe] يوجد اشتراك نشط بالفعل للشركة ${companyId}، سيتم تحديثه`);
        
        // ✅ تحديث الخطة مع الحفاظ على تاريخ البدء الأصلي إذا كان نفس الاشتراك
        const isSamePlan = existingActiveSubscription.plan?.id === newPlan.id;
        
        if (!isSamePlan) {
          existingActiveSubscription.plan = newPlan;
          existingActiveSubscription.customMaxEmployees = newPlan.maxEmployees;
        }
        
        // تحديث السعر
        existingActiveSubscription.price = planPrice;
        
        // ✅ تحديث تاريخ الانتهاء فقط (إضافة المدة الجديدة)
        const newEndDate = new Date(existingActiveSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        existingActiveSubscription.endDate = newEndDate;
        
        // تسجيل من قام بالتحديث
        if (activatedBySellerId) {
          existingActiveSubscription.activatedBySellerId = activatedBySellerId;
          this.logger.log(`[subscribe] تم تسجيل البائع ${activatedBySellerId} كمفعل للاشتراك`);
        }
        
        if (activatedByAdminId) {
          existingActiveSubscription.activatedByAdminId = activatedByAdminId;
          this.logger.log(`[subscribe] تم تسجيل الأدمن ${activatedByAdminId} كمفعل للاشتراك`);
        }

        const savedSubscription = await this.subscriptionRepo.save(existingActiveSubscription);

        // تحديث معلومات الشركة
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

        let message = '';
        if (planPrice === 0) {
          message = 'تم تحديث الاشتراك إلى الخطة المجانية بنجاح';
        } else if (newPlan.isTrial) {
          message = 'تم تحديث الاشتراك إلى الخطة التجريبية بنجاح';
        } else if (isAdminOverride) {
          message = 'تم تحديث الاشتراك يدويًا بواسطة الأدمن';
        } else {
          message = isSamePlan ? 'تم تجديد الاشتراك بنجاح' : 'تم تحديث الاشتراك بنجاح';
        }

        this.logger.log(`[subscribe] تم تحديث الاشتراك بنجاح للشركة ${companyId} في الخطة ${newPlan.name}`);

        return {
          message: message,
          redirectToDashboard: true,
          subscription: savedSubscription,
        };
      } else {
        // إنشاء اشتراك جديد
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
          this.logger.log(`[subscribe] تم تسجيل البائع ${activatedBySellerId} كمفعل للاشتراك`);
        }
        
        if (activatedByAdminId) {
          subscriptionData.activatedByAdminId = activatedByAdminId;
          this.logger.log(`[subscribe] تم تسجيل الأدمن ${activatedByAdminId} كمفعل للاشتراك`);
        }

        // إذا كانت الخطة مجانية أو تجريبية أو من قبل الأدمن
        if (planPrice === 0 || newPlan.isTrial || isAdminOverride) {
          const subscription = this.subscriptionRepo.create(subscriptionData);
          const savedSubscription = await this.subscriptionRepo.save(subscription);

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

          let message = '';
          if (planPrice === 0) {
            message = 'تم الاشتراك في الخطة المجانية بنجاح';
          } else if (newPlan.isTrial) {
            message = 'تم الاشتراك في الخطة التجريبية بنجاح';
          } else if (isAdminOverride) {
            message = 'تم تفعيل الاشتراك يدويًا بواسطة الأدمن';
          }

          this.logger.log(`[subscribe] تم إنشاء اشتراك جديد للشركة ${companyId} في الخطة ${newPlan.name}`);

          return {
            message: message,
            redirectToDashboard: true,
            subscription: savedSubscription,
          };
        }

        // إذا كانت الخطة مدفوعة
        if (planPrice > 0) {
          const provider = newPlan.paymentProvider;
          if (!provider) {
            throw new BadRequestException('مزود الدفع مطلوب للخطط المدفوعة');
          }

          const checkoutUrl = await this.paymentService.generateCheckoutUrl(
            provider,
            newPlan,
            companyId,
          );

          this.logger.log(`[subscribe] تم إنشاء رابط دفع للشركة ${companyId}: ${checkoutUrl}`);

          return {
            message: 'يتطلب إتمام عملية الدفع',
            redirectToPayment: true,
            checkoutUrl,
          };
        }

        throw new BadRequestException('لم يتم الاشتراك - حالة غير متوقعة');
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
      this.logger.error(`[subscribe] فشل الاشتراك للشركة ${companyId}: ${errorMessage}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل في عملية الاشتراك');
    }
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<PlanChangeResult> {
    try {
      this.logger.log(`[changeSubscriptionPlan] بدء تغيير الخطة: الشركة ${companyId} إلى الخطة ${newPlanId}`);

      const validation = await this.validatePlanChange(companyId, newPlanId);
      this.logger.log(`[changeSubscriptionPlan] نتيجة التحقق: ${validation.canChange ? 'يمكن التغيير' : 'لا يمكن التغيير'} - ${validation.message}`);
      
      if (!validation.canChange) {
        throw new BadRequestException(validation.message);
      }

      const currentSubscription = await this.getCompanySubscription(companyId);
      this.logger.log(`[changeSubscriptionPlan] الاشتراك الحالي: ${currentSubscription ? `موجود - الخطة: ${currentSubscription.plan?.name}` : 'غير موجود'}`);
      
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      this.logger.log(`[changeSubscriptionPlan] الخطة الجديدة: ${newPlan ? `موجودة - ${newPlan.name}` : 'غير موجودة'}`);
      
      if (!currentSubscription || !newPlan) {
        throw new NotFoundException('الاشتراك أو الخطة غير موجودة');
      }

      const currentPlanPrice = currentSubscription.plan?.price || 0;
      const newPlanPrice = newPlan.price;
      const currentPlanMax = currentSubscription.plan?.maxEmployees || 0;
      const newPlanMax = newPlan.maxEmployees;

      this.logger.log(`[changeSubscriptionPlan] مقارنة الخطط:`);
      this.logger.log(`[changeSubscriptionPlan] الخطة الحالية: ${currentSubscription.plan?.name} - الموظفين: ${currentPlanMax} - السعر: ${currentPlanPrice}`);
      this.logger.log(`[changeSubscriptionPlan] الخطة الجديدة: ${newPlan.name} - الموظفين: ${newPlanMax} - السعر: ${newPlanPrice}`);
      
      // ✅ التحقق المحسن: السماح فقط إذا كانت الخطة الجديدة أكبر أو تساوي
      // منع النزول إلى خطة أقل سواء في السعر أو عدد الموظفين
      if (newPlanMax < currentPlanMax || newPlanPrice < currentPlanPrice) {
        this.logger.warn(`[changeSubscriptionPlan] محاولة النزول إلى خطة أقل - مرفوض`);
        throw new BadRequestException(
          `غير مسموح بالانتقال من خطة ${currentSubscription.plan?.name} ` +
          `(${currentPlanMax} موظف - ${currentPlanPrice} ريال) ` +
          `إلى خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) ` +
          `- غير مسموح بالانتقال لخطة أقل`
        );
      }

      // ✅ إذا كانت نفس الخطة تماماً (نفس الاسم والسعر والموظفين)
      const isSamePlan = 
        currentSubscription.plan?.id === newPlan.id ||
        (newPlanMax === currentPlanMax && newPlanPrice === currentPlanPrice);
      
      this.logger.log(`[changeSubscriptionPlan] هل هي نفس الخطة؟ ${isSamePlan ? 'نعم' : 'لا'}`);
      
      // ✅ تحديث الخطة
      this.logger.log(`[changeSubscriptionPlan] تحديث الخطة من ${currentSubscription.plan?.name} إلى ${newPlan.name}`);
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlan.price;
      currentSubscription.customMaxEmployees = newPlan.maxEmployees;
      
      if (isSamePlan) {
        const newEndDate = new Date(currentSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
        this.logger.log(`[changeSubscriptionPlan] نفس الخطة - إضافة ${newPlan.durationInDays} يوم إلى تاريخ الانتهاء`);
      } else {
        const oldStartDate = currentSubscription.startDate;
        const oldEndDate = currentSubscription.endDate;
        currentSubscription.startDate = new Date();
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
        this.logger.log(`[changeSubscriptionPlan] خطة جديدة - بدء فترة جديدة: ${currentSubscription.startDate.toISOString()} إلى ${newEndDate.toISOString()}`);
        this.logger.log(`[changeSubscriptionPlan] الفترة القديمة: ${oldStartDate.toISOString()} إلى ${oldEndDate.toISOString()}`);
      }

      const updatedSubscription = await this.subscriptionRepo.save(currentSubscription);
      this.logger.log(`[changeSubscriptionPlan] تم حفظ الاشتراك المحدث: ${updatedSubscription.id}`);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          planId: newPlan.id
        })
        .where('id = :id', { id: companyId })
        .execute();

      this.logger.log(`[changeSubscriptionPlan] تم تحديث معلومات الشركة ${companyId}`);

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
      this.logger.error(`[changeSubscriptionPlan] فشل تغيير الخطة للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async changePlanDirectly(companyId: string, newPlanId: string, adminOverride = false): Promise<PlanChangeResult> {
    try {
      this.logger.log(`[changePlanDirectly] تغيير الخطة مباشرة للشركة ${companyId} إلى ${newPlanId}`);
      
      const currentSubscription = await this.getCompanySubscription(companyId);
      this.logger.log(`[changePlanDirectly] الاشتراك الحالي: ${currentSubscription ? `موجود - الخطة: ${currentSubscription.plan?.name}` : 'غير موجود'}`);
      
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      this.logger.log(`[changePlanDirectly] الخطة الجديدة: ${newPlan ? `موجودة - ${newPlan.name}` : 'غير موجودة'}`);
      
      if (!newPlan) {
        throw new NotFoundException('الخطة غير موجودة');
      }
      
      // ✅ إذا لم يكن هناك اشتراك حالي، إنشاء اشتراك جديد
      if (!currentSubscription) {
        this.logger.log(`[changePlanDirectly] لا يوجد اشتراك حالي، إنشاء اشتراك جديد`);
        return await this.subscribe(companyId, newPlanId, adminOverride) as PlanChangeResult;
      }
      
      const currentPlan = currentSubscription.plan;
      const currentPlanMax = currentPlan?.maxEmployees || 0;
      const currentPlanPrice = currentPlan?.price || 0;
      const newPlanMax = newPlan.maxEmployees;
      const newPlanPrice = newPlan.price;

      this.logger.log(`[changePlanDirectly] مقارنة الخطط:`);
      this.logger.log(`[changePlanDirectly] الخطة الحالية: ${currentPlan?.name} - الموظفين: ${currentPlanMax} - السعر: ${currentPlanPrice}`);
      this.logger.log(`[changePlanDirectly] الخطة الجديدة: ${newPlan.name} - الموظفين: ${newPlanMax} - السعر: ${newPlanPrice}`);
      
      // ✅ التحقق الأساسي: منع النزول للخطة الأقل
      const isDowngrading = newPlanMax < currentPlanMax && newPlanPrice < currentPlanPrice;
      const isPartialDowngrade = (newPlanMax < currentPlanMax && newPlanPrice >= currentPlanPrice) ||
                                 (newPlanMax >= currentPlanMax && newPlanPrice < currentPlanPrice);
      
      this.logger.log(`[changePlanDirectly] هل هي ترقية؟ ${!(isDowngrading || isPartialDowngrade) ? 'نعم' : 'لا'}`);
      
      if ((isDowngrading || isPartialDowngrade) && !adminOverride) {
        this.logger.warn(`[changePlanDirectly] محاولة النزول إلى خطة أقل - مرفوض`);
        throw new BadRequestException(
          `غير مسموح بالانتقال إلى خطة أقل. ` +
          `الخطة الحالية: ${currentPlan?.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) ` +
          `الخطة الجديدة: ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال)`
        );
      }
      
      // ✅ التحقق من عدد الموظفين الحاليين
      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });
      
      this.logger.log(`[changePlanDirectly] عدد الموظفين الحاليين: ${currentEmployees}`);
      
      if (currentEmployees > newPlanMax && !adminOverride) {
        this.logger.warn(`[changePlanDirectly] عدد الموظفين ${currentEmployees} يتجاوز حد الخطة الجديدة ${newPlanMax} - مرفوض`);
        throw new BadRequestException(
          `لا يمكن الانتقال إلى الخطة ${newPlan.name} لأنها تدعم فقط ${newPlanMax} موظف ` +
          `بينما لديك حالياً ${currentEmployees} موظف`
        );
      }
      
      // ✅ تحديث الاشتراك
      this.logger.log(`[changePlanDirectly] تحديث الخطة من ${currentPlan?.name} إلى ${newPlan.name}`);
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlan.price;
      currentSubscription.customMaxEmployees = newPlan.maxEmployees;
      
      // ✅ إذا كانت نفس الخطة، إضافة المدة. إذا كانت خطة جديدة، بدء فترة جديدة
      const isSamePlan = newPlan.id === currentPlan?.id;
      this.logger.log(`[changePlanDirectly] هل هي نفس الخطة؟ ${isSamePlan ? 'نعم' : 'لا'}`);
      
      if (isSamePlan) {
        // تجديد: إضافة المدة إلى تاريخ الانتهاء الحالي
        const newEndDate = new Date(currentSubscription.endDate);
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
        this.logger.log(`[changePlanDirectly] نفس الخطة - إضافة ${newPlan.durationInDays} يوم إلى تاريخ الانتهاء`);
      } else {
        const oldStartDate = currentSubscription.startDate;
        const oldEndDate = currentSubscription.endDate;
        currentSubscription.startDate = new Date();
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + newPlan.durationInDays);
        currentSubscription.endDate = newEndDate;
        this.logger.log(`[changePlanDirectly] خطة جديدة - بدء فترة جديدة: ${currentSubscription.startDate.toISOString()} إلى ${newEndDate.toISOString()}`);
        this.logger.log(`[changePlanDirectly] الفترة القديمة: ${oldStartDate.toISOString()} إلى ${oldEndDate.toISOString()}`);
      }
      
      const updatedSubscription = await this.subscriptionRepo.save(currentSubscription);
      this.logger.log(`[changePlanDirectly] تم حفظ الاشتراك المحدث: ${updatedSubscription.id}`);
      
      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          planId: newPlan.id
        })
        .where('id = :id', { id: companyId })
        .execute();
      
      this.logger.log(`[changePlanDirectly] تم تحديث معلومات الشركة ${companyId}`);
      this.logger.log(`[changePlanDirectly] تم تغيير خطة الشركة ${companyId} من ${currentPlan?.name} إلى ${newPlan.name}`);
      
      return {
        message: isSamePlan ? 'تم تجديد الاشتراك بنجاح' : 'تم تغيير الخطة بنجاح',
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
      this.logger.error(`[changePlanDirectly] فشل تغيير الخطة مباشرة للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async requestPlanChange(companyId: string, newPlanId: string): Promise<PlanChangeRequestResult> {
    try {
      this.logger.log(`[requestPlanChange] طلب تغيير الخطة: الشركة ${companyId} إلى ${newPlanId}`);
      
      const validation = await this.validatePlanChange(companyId, newPlanId);
      this.logger.log(`[requestPlanChange] نتيجة التحقق: ${validation.canChange ? 'يمكن التغيير' : 'لا يمكن التغيير'} - ${validation.message}`);
      
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

      this.logger.log(`[requestPlanChange] طلب ناجح - الأيام المتبقية: ${daysRemaining}, المدة الجديدة: ${newDurationInDays} يوم`);

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
      this.logger.error(`[requestPlanChange] فشل طلب تغيير الخطة للشركة ${companyId}: ${errorMessage}`);
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
        this.logger.log(`[updateRelatedPaymentProof] تم تحديث حالة إثبات الدفع للشركة ${companyId}`);
      } else {
        this.logger.warn(`[updateRelatedPaymentProof] لم يتم العثور على إثبات دفع معلق للشركة ${companyId} والخطة ${planId}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[updateRelatedPaymentProof] فشل تحديث حالة إثبات الدفع: ${errorMessage}`);
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
      this.logger.log(`[updateCompanyEmployeeLimit] تحديث حد الموظفين للشركة ${companyId} إلى ${newLimit}`);
      
      const subscription = await this.getCompanySubscription(companyId);
      if (!subscription) throw new NotFoundException('لا يوجد اشتراك للشركة');

      subscription.customMaxEmployees = newLimit;
      await this.subscriptionRepo.save(subscription);

      this.logger.log(`[updateCompanyEmployeeLimit] تم تعديل الحد المسموح للموظفين إلى ${newLimit}`);

      return {
        message: `تم تعديل الحد المسموح للموظفين إلى ${newLimit}`,
        subscription,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[updateCompanyEmployeeLimit] فشل تعديل الحد للموظفين للشركة ${companyId}: ${msg}`);
      throw new InternalServerErrorException('فشل تعديل الحد للموظفين');
    }
  }
  
  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    try {
      this.logger.debug(`[getCompanySubscription] جلب اشتراك الشركة ${companyId}`);
      
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
        this.logger.debug(`[getCompanySubscription] لا يوجد اشتراك نشط للشركة: ${companyId}`);
        
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

      this.logger.debug(`[getCompanySubscription] تم العثور على اشتراك نشط للشركة: ${companyId}, الخطة: ${subscription.plan?.name}`);
      return subscription;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[getCompanySubscription] فشل جلب الاشتراك للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('Failed to get subscription');
    }
  }

  async getAllowedEmployees(companyId: string): Promise<{ maxAllowed: number; remaining: number; current: number }> {
    try {
      this.logger.debug(`[getAllowedEmployees] التحقق من الحد المسموح للموظفين للشركة: ${companyId}`);
      
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        this.logger.warn(`[getAllowedEmployees] الشركة ${companyId} ليس لديها اشتراك نشط`);
        return { maxAllowed: 0, remaining: 0, current: 0 };
      }

      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const maxAllowed = activeSubscription.customMaxEmployees ?? activeSubscription.plan?.maxEmployees ?? 0;
      const remaining = Math.max(0, maxAllowed - currentEmployees);

      this.logger.debug(`[getAllowedEmployees] النتيجة: ${currentEmployees}/${maxAllowed} موظف، المتبقي: ${remaining}`);

      return { 
        maxAllowed, 
        remaining, 
        current: currentEmployees 
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[getAllowedEmployees] فشل حساب الحد المسموح للموظفين للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حساب الحد المسموح للموظفين');
    }
  }

  async canAddEmployee(companyId: string): Promise<{ canAdd: boolean; allowed: number; current: number; maxAllowed: number }> {
    try {
      this.logger.debug(`[canAddEmployee] التحقق من إمكانية إضافة موظف للشركة: ${companyId}`);
      
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        this.logger.warn(`[canAddEmployee] الشركة ${companyId} ليس لديها اشتراك نشط`);
        return { canAdd: false, allowed: 0, current: 0, maxAllowed: 0 };
      }

      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const maxAllowed = activeSubscription.customMaxEmployees ?? activeSubscription.plan?.maxEmployees ?? 0;
      const remaining = Math.max(0, maxAllowed - currentEmployees);
      const canAdd = remaining > 0;

      this.logger.debug(`[canAddEmployee] النتيجة: يمكن الإضافة؟ ${canAdd}, المتبقي: ${remaining}`);

      return { 
        canAdd, 
        allowed: remaining, 
        current: currentEmployees, 
        maxAllowed 
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[canAddEmployee] فشل التحقق من إمكانية إضافة موظف: ${errorMessage}`);
      throw new InternalServerErrorException('فشل التحقق من إمكانية إضافة موظف');
    }
  }

  async getUsage(companyId: string): Promise<any> {
    try {
      this.logger.debug(`[getUsage] حساب استخدام الشركة ${companyId}`);
      
      const { canAdd, allowed, current, maxAllowed } = await this.canAddEmployee(companyId);
      const subscription = await this.getCompanySubscription(companyId);
      const now = new Date();
      const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;

      this.logger.debug(`[getUsage] النتيجة: منتهي؟ ${isExpired}, يمكن الإضافة؟ ${canAdd}`);

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
      this.logger.error(`[getUsage] فشل حساب استخدام الشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حساب الاستخدام');
    }
  }

  async cancelSubscription(companyId: string): Promise<CancelSubscriptionResult> {
    try {
      this.logger.log(`[cancelSubscription] إلغاء اشتراك الشركة ${companyId}`);
      
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

      const result: CancelSubscriptionResult = { 
        message: 'تم إلغاء جميع اشتراكات الشركة بنجاح', 
        cancelledSubscriptions: deactivatedCount,
        companyStatus: 'inactive - غير قادرة على إضافة موظفين',
        note: 'الشركة لن تتمكن من إضافة موظفين جدد حتى تشترك في خطة جديدة. يمكن استرجاع الاشتراكات السابقة من سجل الاشتراكات.'
      };

      this.logger.log(`[cancelSubscription] تم إلغاء اشتراك الشركة ${companyId} وإلغاء تفعيل ${deactivatedCount} اشتراك`);
      return result;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[cancelSubscription] فشل إلغاء الاشتراكات للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  async extendSubscription(companyId: string): Promise<ExtendSubscriptionResult> {
    try {
      this.logger.log(`[extendSubscription] تمديد اشتراك الشركة ${companyId}`);
      
      const { activeSubscription } = await this.validateCompanySubscription(companyId);
      
      if (!activeSubscription) {
        throw new NotFoundException('لا يوجد اشتراك نشط للتمديد');
      }

      const allowedEmployees = await this.getAllowedEmployees(companyId);
      const currentEmployeeCount = allowedEmployees.current;
      const maxAllowed = allowedEmployees.maxAllowed;

      this.logger.log(`[extendSubscription] عدد الموظفين: ${currentEmployeeCount}/${maxAllowed}`);

      // ✅ التحقق المحسن: السماح بالتجديد إذا كانت الخطة تستوعب الموظفين الحاليين
      if (currentEmployeeCount > maxAllowed) {
        this.logger.warn(`[extendSubscription] عدد الموظفين ${currentEmployeeCount} يتجاوز الحد ${maxAllowed} - مرفوض`);
        throw new BadRequestException(
          `لا يمكن تمديد الاشتراك - عدد الموظفين الحاليين (${currentEmployeeCount}) ` +
          `يتجاوز الحد المسموح (${maxAllowed})`
        );
      }

      // ✅ حساب الأيام المتبقية من الاشتراك القديم
      const now = new Date();
      const endDate = new Date(activeSubscription.endDate);
      const daysRemainingBefore = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      // ✅ إضافة سنة كاملة (365 يوم) إلى تاريخ الانتهاء الحالي
      const newEndDate = new Date(activeSubscription.endDate);
      newEndDate.setDate(newEndDate.getDate() + 365); // إضافة سنة كاملة
      
      // ✅ حساب إجمالي الأيام المضافة
      const totalDaysAdded = 365;
      
      // ✅ حساب الأيام المتبقية بعد التمديد
      const daysRemainingAfter = daysRemainingBefore + totalDaysAdded;
      
      this.logger.log(`[extendSubscription] الأيام المتبقية قبل: ${daysRemainingBefore}، بعد: ${daysRemainingAfter}، المضاف: ${totalDaysAdded}`);
      
      // ✅ تحديث تاريخ الانتهاء فقط (بدون تعديل تاريخ البدء)
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

      this.logger.log(`[extendSubscription] تم تمديد اشتراك الشركة ${companyId} حتى ${newEndDate.toDateString()} (تمت إضافة سنة كاملة)`);

      const result: ExtendSubscriptionResult = { 
        message: 'تم تمديد الاشتراك بنجاح لمدة سنة إضافية', 
        subscription: updatedSubscription,
        details: {
          currentEmployees: currentEmployeeCount,
          maxAllowed: maxAllowed,
          remainingSlots: maxAllowed - currentEmployeeCount,
          newEndDate: updatedSubscription.endDate,
          planStatus: `الخطة الحالية (${maxAllowed} موظف) ${maxAllowed === currentEmployeeCount ? 'مساوية' : 'أعلى'} من عدد الموظفين الحاليين`,
          planName: activeSubscription.plan.name,
          durationAdded: `${totalDaysAdded} يوم (سنة كاملة)`,
          daysRemainingBefore: daysRemainingBefore,
          daysRemainingAfter: daysRemainingAfter,
          totalDaysAdded: totalDaysAdded
        }
      };
      return result;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[extendSubscription] فشل تجديد الاشتراك للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async validatePlanChange(companyId: string, newPlanId: string): Promise<PlanChangeValidation> {
    try {
      this.logger.log(`[validatePlanChange] التحقق من تغيير الخطة: الشركة ${companyId} إلى ${newPlanId}`);
      
      const currentSubscription = await this.getCompanySubscription(companyId);
      this.logger.log(`[validatePlanChange] الاشتراك الحالي: ${currentSubscription ? `موجود` : 'غير موجود'}`);
      
      // ✅ إذا لم يكن هناك اشتراك نشط، السماح بالاشتراك في أي خطة
      if (!currentSubscription) {
        this.logger.log(`[validatePlanChange] لا يوجد اشتراك حالي، السماح بالاشتراك الجديد`);
        
        const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
        if (!newPlan) {
          throw new NotFoundException('الخطة الجديدة غير موجودة');
        }
        
        const currentEmployees = await this.employeeRepo.count({
          where: { company: { id: companyId } }
        });
        
        // ✅ التحقق من أن الخطة الجديدة تستوعب الموظفين الحاليين
        const canChange = newPlan.maxEmployees >= currentEmployees;
        const action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID' = 'UPGRADE';
        
        let message = '';
        if (canChange) {
          message = `يمكنك الاشتراك في الخطة ${newPlan.name} التي تدعم ${newPlan.maxEmployees} موظف`;
        } else {
          message = `لا يمكن الاشتراك في الخطة ${newPlan.name} (${newPlan.maxEmployees} موظف) لأن لديك ${currentEmployees} موظف`;
        }
        
        this.logger.log(`[validatePlanChange] نتيجة التحقق: ${canChange ? 'يمكن التغيير' : 'لا يمكن التغيير'} - ${message}`);
        
        return {
          canChange,
          message,
          currentPlanMax: 0,
          newPlanMax: newPlan.maxEmployees,
          currentEmployees,
          action
        };
      }
      
      // ✅ إذا كان هناك اشتراك نشط
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      if (!newPlan) {
        throw new NotFoundException('الخطة الجديدة غير موجودة');
      }
      
      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const currentPlanMax = currentSubscription.plan?.maxEmployees || 0;
      const newPlanMax = newPlan.maxEmployees;
      const currentPlanPrice = currentSubscription.plan?.price || 0;
      const newPlanPrice = newPlan.price;

      this.logger.log(`[validatePlanChange] مقارنة:`);
      this.logger.log(`[validatePlanChange] الحالية: ${currentPlanMax} موظف - ${currentPlanPrice} ريال`);
      this.logger.log(`[validatePlanChange] الجديدة: ${newPlanMax} موظف - ${newPlanPrice} ريال`);
      this.logger.log(`[validatePlanChange] الموظفين الحاليين: ${currentEmployees}`);

      let action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID';
      let message = '';

      // ✅ تعريف واضح للخطة الأقل: أقل في عدد الموظفين وأقل في السعر
      const isDowngrading = newPlanMax < currentPlanMax && newPlanPrice < currentPlanPrice;
      
      // ✅ إذا كانت الخطة الجديدة أقل في أحد الجانبين لكن ليست أقل في كليهما
      const isPartialDowngrade = (newPlanMax < currentPlanMax && newPlanPrice >= currentPlanPrice) ||
                                 (newPlanMax >= currentPlanMax && newPlanPrice < currentPlanPrice);
      
      // ✅ إذا كانت نفس الخطة تماماً
      const isSamePlan = newPlanMax === currentPlanMax && newPlanPrice === currentPlanPrice;
      
      this.logger.log(`[validatePlanChange] تحليل:`);
      this.logger.log(`[validatePlanChange] هل هي تنزيل؟ ${isDowngrading}`);
      this.logger.log(`[validatePlanChange] هل هي تنزيل جزئي؟ ${isPartialDowngrade}`);
      this.logger.log(`[validatePlanChange] هل هي نفس الخطة؟ ${isSamePlan}`);
      
      if (isDowngrading) {
        action = 'DOWNGRADE';
        message = `غير مسموح بالانتقال من خطة ${currentSubscription.plan?.name} (${currentPlanMax} موظف - ${currentPlanPrice} ريال) إلى خطة ${newPlan.name} (${newPlanMax} موظف - ${newPlanPrice} ريال) - غير مسموح بالانتقال لخطة أقل`;
        this.logger.log(`[validatePlanChange] نتيجة: DOWNGRADE - ${message}`);
        return {
          canChange: false,
          message,
          currentPlanMax,
          newPlanMax,
          currentEmployees,
          action
        };
      } else if (isPartialDowngrade) {
        action = 'DOWNGRADE';
        message = `غير مسموح بالانتقال إلى خطة ${newPlan.name} لأنها أقل في ${newPlanMax < currentPlanMax ? 'عدد الموظفين' : 'السعر'}`;
        this.logger.log(`[validatePlanChange] نتيجة: DOWNGRADE - ${message}`);
        return {
          canChange: false,
          message,
          currentPlanMax,
          newPlanMax,
          currentEmployees,
          action
        };
      } else if (isSamePlan) {
        action = 'RENEW';
        message = `يمكنك التجديد في نفس الخطة ${newPlan.name}`;
        this.logger.log(`[validatePlanChange] نتيجة: RENEW - ${message}`);
      } else if (newPlanMax > currentPlanMax || newPlanPrice > currentPlanPrice) {
        action = 'UPGRADE';
        message = `يمكنك الترقية إلى الخطة ${newPlan.name} التي تدعم ${newPlanMax} موظف بسعر ${newPlanPrice} ريال`;
        this.logger.log(`[validatePlanChange] نتيجة: UPGRADE - ${message}`);
      } else {
        // ✅ حالة نادرة: الخطة الجديدة تساوي في الموظفين والسعر (ممكن خطة مختلفة بنفس المواصفات)
        action = 'RENEW';
        message = `يمكنك التغيير إلى الخطة ${newPlan.name}`;
        this.logger.log(`[validatePlanChange] نتيجة: RENEW (مماثلة) - ${message}`);
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

      this.logger.log(`[validatePlanChange] النتيجة النهائية: ${canChange ? 'يمكن التغيير' : 'لا يمكن التغيير'}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[validatePlanChange] فشل التحقق من تغيير الخطة: ${errorMessage}`);
      throw error;
    }
  }

  // ✅ دالة جديدة للتحقق من إمكانية الترقية
  async canUpgradeToPlan(companyId: string, planId: string): Promise<UpgradeCheckResult> {
    try {
      this.logger.log(`[canUpgradeToPlan] التحقق من إمكانية الترقية: الشركة ${companyId} إلى ${planId}`);
      
      const currentSubscription = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      
      if (!newPlan) {
        this.logger.log(`[canUpgradeToPlan] الخطة غير موجودة`);
        return { canUpgrade: false, reason: 'الخطة غير موجودة' };
      }

      // ✅ إذا لم يكن هناك اشتراك حالي، يمكن الاشتراك في أي خطة
      if (!currentSubscription) {
        this.logger.log(`[canUpgradeToPlan] لا يوجد اشتراك حالي، يمكن الاشتراك`);
        return { 
          canUpgrade: true, 
          reason: 'يمكن الاشتراك في هذه الخطة',
          newPlan 
        };
      }

      const currentPlan = currentSubscription.plan;
      
      // ✅ إذا كانت نفس الخطة
      if (currentPlan.id === newPlan.id) {
        this.logger.log(`[canUpgradeToPlan] نفس الخطة، يمكن التجديد`);
        return { 
          canUpgrade: true, 
          isSamePlan: true,
          reason: 'نفس الخطة - يمكن التجديد',
          currentPlan,
          newPlan 
        };
      }

      // ✅ التحقق إذا كانت الخطة الجديدة أكبر أو تساوي
      const isUpgrade = newPlan.maxEmployees >= currentPlan.maxEmployees && 
                       newPlan.price >= currentPlan.price;
      
      if (!isUpgrade) {
        this.logger.log(`[canUpgradeToPlan] لا يمكن النزول إلى خطة أقل`);
        return { 
          canUpgrade: false, 
          reason: `لا يمكن النزول إلى خطة أقل. الخطة الحالية: ${currentPlan.name} (${currentPlan.maxEmployees} موظف - ${currentPlan.price} ريال)`,
          currentPlan,
          newPlan
        };
      }

      this.logger.log(`[canUpgradeToPlan] يمكن الترقية`);
      return { 
        canUpgrade: true, 
        reason: 'يمكن الترقية إلى هذه الخطة',
        currentPlan,
        newPlan
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[canUpgradeToPlan] Failed to check upgrade: ${errorMessage}`);
      return { canUpgrade: false, reason: 'خطأ في التحقق' };
    }
  }

  // ✅ دالة جديدة للحصول على الخطط المتاحة للترقية
  async getAvailableUpgrades(companyId: string): Promise<Plan[]> {
    try {
      this.logger.log(`[getAvailableUpgrades] جلب الخطط المتاحة للشركة ${companyId}`);
      
      const allPlans = await this.planRepo.find();
      const currentSubscription = await this.getCompanySubscription(companyId);
      
      // ✅ إذا لم يكن هناك اشتراك حالي، كل الخطط متاحة
      if (!currentSubscription) {
        this.logger.log(`[getAvailableUpgrades] لا يوجد اشتراك حالي، كل الخطط متاحة`);
        return allPlans.sort((a, b) => a.maxEmployees - b.maxEmployees);
      }
      
      const currentPlan = currentSubscription.plan;
      this.logger.log(`[getAvailableUpgrades] الخطة الحالية: ${currentPlan.name} (${currentPlan.maxEmployees} موظف - ${currentPlan.price} ريال)`);
      
      // ✅ تصفية الخطط المسموح بها (أكبر أو تساوي)
      const availablePlans = allPlans.filter(plan => 
        (plan.maxEmployees >= currentPlan.maxEmployees && 
         plan.price >= currentPlan.price) ||
        plan.id === currentPlan.id // ✅ تضمين الخطة الحالية للتجديد
      );
      
      this.logger.log(`[getAvailableUpgrades] عدد الخطط المتاحة: ${availablePlans.length} من ${allPlans.length}`);
      
      return availablePlans.sort((a, b) => a.maxEmployees - b.maxEmployees);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getAvailableUpgrades] Failed to get available upgrades: ${errorMessage}`);
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

      this.logger.log(`[getExpiringSubscriptions] تم جلب ${subscriptions.length} اشتراكًا ينتهي خلال ${daysThreshold} يوم`);
      return subscriptions;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getExpiringSubscriptions] فشل جلب الاشتراكات القريبة من الانتهاء: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب الاشتراكات القريبة من الانتهاء');
    }
  }

  async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
    try {
      this.logger.log(`[getSubscriptionHistory] جلب سجل اشتراكات الشركة ${companyId}`);
      
      const subscriptions = await this.subscriptionRepo.find({
        where: { company: { id: companyId } },
        relations: ['plan', 'paymentTransaction', 'activatedBySeller', 'activatedByAdmin'],
        order: { startDate: 'DESC' },
      });

      this.logger.log(`[getSubscriptionHistory] تم جلب ${subscriptions.length} اشتراك في السجل`);
      return subscriptions;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getSubscriptionHistory] فشل جلب سجل الاشتراكات للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  async overrideEmployeeLimit(companyId: string, newMaxEmployees: number): Promise<void> {
    this.logger.log(`[overrideEmployeeLimit] محاولة تجاوز حدود الموظفين للشركة: ${companyId} إلى ${newMaxEmployees}`);
    
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
    this.logger.log(`[overrideEmployeeLimit] تم تحديث الحد الأقصى للموظفين إلى: ${newMaxEmployees}`);
  }

  async autoUpgradeEmployeeLimit(companyId: string, upgradePercentage: number = 50): Promise<void> {
    this.logger.log(`[autoUpgradeEmployeeLimit] محاولة الترقية التلقائية لحدود الموظفين للشركة: ${companyId}`);
    
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
    
    this.logger.log(`[autoUpgradeEmployeeLimit] تمت الترقية التلقائية من ${currentMax} إلى ${newMax} موظف`);
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
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          });

          await transporter.sendMail({ from: process.env.EMAIL_USER, to: companyEmail, subject, text: message });
          this.logger.log(`[notifyExpiringSubscriptions] تم إرسال تنبيه إلى ${companyEmail}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(`[notifyExpiringSubscriptions] فشل إرسال التنبيه إلى ${companyEmail}: ${errorMessage}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[notifyExpiringSubscriptions] فشل فحص الاشتراكات القريبة من الانتهاء: ${errorMessage}`);
    }
  }

  private generateRenewalUrl(companyId: string, planId: string, currentEndDate: Date, durationInDays: number): string {
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + durationInDays);
    const formattedDate = newEndDate.toISOString().split('T')[0];
    return `http://localhost:3000/renew-subscription?companyId=${companyId}&planId=${planId}&newEndDate=${formattedDate}`;
  }

  async getCurrentEmployeeCount(companyId: string): Promise<number> {
    try {
      const count = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });
      this.logger.debug(`[getCurrentEmployeeCount] عدد موظفي الشركة ${companyId}: ${count}`);
      return count;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[getCurrentEmployeeCount] Failed to get employee count for company ${companyId}: ${errorMessage}`);
      return 0;
    }
  }

  async syncCompanySubscriptionStatus(companyId: string): Promise<void> {
    try {
      this.logger.log(`[syncCompanySubscriptionStatus] Syncing subscription status for company: ${companyId}`);
      
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
        this.logger.warn(`[syncCompanySubscriptionStatus] Company not found: ${companyId}`);
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
          
          this.logger.log(`[syncCompanySubscriptionStatus] Synced company ${companyId} status to ACTIVE with plan: ${latestSubscription.plan.name}`);
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
          
          this.logger.log(`[syncCompanySubscriptionStatus] Synced company ${companyId} status to INACTIVE - no active subscriptions`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[syncCompanySubscriptionStatus] Failed to sync subscription status for company ${companyId}: ${errorMessage}`);
    }
  }

  async hasActiveSubscription(companyId: string): Promise<boolean> {
    try {
      const subscription = await this.getCompanySubscription(companyId);
      const hasActive = !!subscription;
      this.logger.debug(`[hasActiveSubscription] الشركة ${companyId} لديها اشتراك نشط؟ ${hasActive}`);
      return hasActive;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[hasActiveSubscription] Failed to check active subscription for company ${companyId}: ${errorMessage}`);
      return false;
    }
  }

  async debugSubscriptionStatus(companyId: string): Promise<any> {
    try {
      this.logger.log(`[debugSubscriptionStatus] تصحيح حالة الاشتراك للشركة ${companyId}`);
      
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

      this.logger.log(`[debugSubscriptionStatus] نتيجة التصحيح: ${JSON.stringify(result, null, 2)}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[debugSubscriptionStatus] Debug failed for company ${companyId}: ${errorMessage}`);
      return { error: 'Debug failed' };
    }
  }
}