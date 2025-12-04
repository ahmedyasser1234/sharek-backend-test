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

  // دالة مساعدة لإلغاء تفعيل الاشتراكات القديمة بدلاً من حذفها
  private async deactivateOldSubscriptions(companyId: string): Promise<{ deactivatedCount: number }> {
    try {
      // البحث عن الاشتراكات النشطة القديمة
      const oldActiveSubscriptions = await this.subscriptionRepo.find({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (oldActiveSubscriptions.length > 0) {
        let deactivatedCount = 0;
        
        // تحديث حالة الاشتراكات القديمة إلى غير نشطة
        for (const sub of oldActiveSubscriptions) {
          // فقط إذا كان الاشتراك لا يزال نشطاً
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
      this.logger.error('فشل جلب الخطط', error);
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
      this.logger.log(`بدء الاشتراك: الشركة ${companyId} في الخطة ${planId}`);

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

      // التحقق من وجود اشتراك نشط بالفعل لهذه الشركة
      const existingActiveSubscription = await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE,
          endDate: MoreThanOrEqual(new Date())
        }
      });

      if (existingActiveSubscription) {
        // إذا كان هناك اشتراك نشط، نقوم بتحديثه بدلاً من إنشاء جديد
        this.logger.log(` يوجد اشتراك نشط بالفعل للشركة ${companyId}، سيتم تحديثه`);
        
        existingActiveSubscription.plan = newPlan;
        existingActiveSubscription.startDate = new Date();
        existingActiveSubscription.endDate = new Date();
        existingActiveSubscription.endDate.setDate(existingActiveSubscription.startDate.getDate() + newPlan.durationInDays);
        existingActiveSubscription.price = planPrice;
        existingActiveSubscription.customMaxEmployees = newPlan.maxEmployees;
        
        if (activatedBySellerId) {
          existingActiveSubscription.activatedBySellerId = activatedBySellerId;
          this.logger.log(`تم تسجيل البائع ${activatedBySellerId} كمفعل للاشتراك`);
        }
        
        if (activatedByAdminId) {
          existingActiveSubscription.activatedByAdminId = activatedByAdminId;
          this.logger.log(`تم تسجيل الأدمن ${activatedByAdminId} كمفعل للاشتراك`);
        }

        const savedSubscription = await this.subscriptionRepo.save(existingActiveSubscription);

        // تحديث حالة الشركة
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
          message = 'تم تحديث الاشتراك بنجاح';
        }

        this.logger.log(` تم تحديث الاشتراك بنجاح للشركة ${companyId} في الخطة ${newPlan.name}`);

        return {
          message: message,
          redirectToDashboard: true,
          subscription: savedSubscription,
        };
      } else {
        // لا يوجد اشتراك نشط، ننشئ اشتراكاً جديداً
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
          this.logger.log(`تم تسجيل البائع ${activatedBySellerId} كمفعل للاشتراك`);
        }
        
        if (activatedByAdminId) {
          subscriptionData.activatedByAdminId = activatedByAdminId;
          this.logger.log(`تم تسجيل الأدمن ${activatedByAdminId} كمفعل للاشتراك`);
        }

        // للخطط المجانية أو التجريبية أو تجاوز الأدمن
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

          this.logger.log(` تم إنشاء اشتراك جديد للشركة ${companyId} في الخطة ${newPlan.name}`);

          return {
            message: message,
            redirectToDashboard: true,
            subscription: savedSubscription,
          };
        }

        // للخطط المدفوعة
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

          this.logger.log(`تم إنشاء رابط دفع للشركة ${companyId}: ${checkoutUrl}`);

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
      this.logger.error(` فشل الاشتراك للشركة ${companyId}: ${errorMessage}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل في عملية الاشتراك');
    }
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<PlanChangeResult> {
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

      if (validation.action === 'DOWNGRADE') {
        throw new BadRequestException(
          `لا يمكن التغيير من خطة ${currentSubscription.plan?.name} (${validation.currentPlanMax} موظف) إلى خطة ${newPlan.name} (${validation.newPlanMax} موظف) - غير مسموح بالانتقال لخطة أقل`
        );
      }

      // تحديث الاشتراك الحالي بدلاً من حذفه وإنشاء جديد
      currentSubscription.plan = newPlan;
      currentSubscription.startDate = new Date();
      currentSubscription.endDate = new Date();
      currentSubscription.endDate.setDate(currentSubscription.startDate.getDate() + newPlan.durationInDays);
      currentSubscription.price = newPlan.price;
      currentSubscription.customMaxEmployees = Math.max(newPlan.maxEmployees, validation.currentPlanMax);

      const updatedSubscription = await this.subscriptionRepo.save(currentSubscription);

      await this.companyRepo
        .createQueryBuilder()
        .update(Company)
        .set({
          planId: newPlan.id
        })
        .where('id = :id', { id: companyId })
        .execute();

      return { 
        message: 'تم تغيير الخطة بنجاح', 
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
      this.logger.error(` فشل تغيير الخطة للشركة ${companyId}`, error);
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
          message: `غير مسموح بالانتقال من خطة أعلى إلى خطة أقل`,
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
      this.logger.error(` فشل طلب تغيير الخطة للشركة ${companyId}`, error);
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
        this.logger.log(` تم تحديث حالة إثبات الدفع للشركة ${companyId}`);
      } else {
        this.logger.warn(` لم يتم العثور على إثبات دفع معلق للشركة ${companyId} والخطة ${planId}`);
      }
    } catch (error) {
      this.logger.error(` فشل تحديث حالة إثبات الدفع: ${String(error)}`);
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
      this.logger.error(` فشل تعديل الحد للموظفين للشركة ${companyId}: ${msg}`);
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
        this.logger.debug(` No active subscription found for company: ${companyId}`);
        
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

      this.logger.debug(` Found active subscription for company: ${companyId}, plan: ${subscription.plan?.name}`);
      return subscription;

    } catch (error: unknown) {
      this.logger.error(` Failed to get subscription for company ${companyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new InternalServerErrorException('Failed to get subscription');
    }
  }

  async getAllowedEmployees(companyId: string): Promise<{ maxAllowed: number; remaining: number; current: number }> {
    try {
      this.logger.debug(`التحقق من الحد المسموح للموظفين للشركة: ${companyId}`);
      
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        this.logger.warn(` الشركة ${companyId} ليس لديها اشتراك نشط`);
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
      this.logger.error(` فشل حساب الحد المسموح للموظفين للشركة ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حساب الحد المسموح للموظفين');
    }
  }

  async canAddEmployee(companyId: string): Promise<{ canAdd: boolean; allowed: number; current: number; maxAllowed: number }> {
    try {
      this.logger.debug(`التحقق من إمكانية إضافة موظف للشركة: ${companyId}`);
      
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan']
      });

      if (!activeSubscription) {
        this.logger.warn(` الشركة ${companyId} ليس لديها اشتراك نشط`);
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
      this.logger.error(` فشل التحقق من إمكانية إضافة موظف: ${errorMessage}`);
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
      this.logger.error(` فشل حساب استخدام الشركة ${companyId}`, error);
      throw new InternalServerErrorException('فشل حساب الاستخدام');
    }
  }

  async cancelSubscription(companyId: string): Promise<CancelSubscriptionResult> {
    try {
      // إلغاء تفعيل جميع الاشتراكات النشطة بدلاً من حذفها
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

      this.logger.log(` تم إلغاء اشتراك الشركة ${companyId} وإلغاء تفعيل ${deactivatedCount} اشتراك`);
      return result;

    } catch (error: unknown) {
      this.logger.error(` فشل إلغاء الاشتراكات للشركة ${companyId}`, error);
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  async extendSubscription(companyId: string): Promise<ExtendSubscriptionResult> {
    try {
      const { activeSubscription } = await this.validateCompanySubscription(companyId);
      
      if (!activeSubscription) {
        throw new NotFoundException('لا يوجد اشتراك نشط للتمديد');
      }

      const allowedEmployees = await this.getAllowedEmployees(companyId);
      const currentEmployeeCount = allowedEmployees.current;
      const maxAllowed = allowedEmployees.maxAllowed;

      const currentPlanMax = activeSubscription.plan.maxEmployees;
      if (maxAllowed < currentPlanMax) {
        throw new BadRequestException(
          `لا يمكن تمديد الاشتراك - الخطة الحالية تدعم ${maxAllowed} موظف بينما الخطة الأصلية كانت ${currentPlanMax} موظف.\n\n` +
          `يجب الاشتراك في خطة تدعم ${currentEmployeeCount} موظف أو أكثر.`
        );
      }

      // تحديث تاريخ الانتهاء للاشتراك الحالي بدلاً من إنشاء جديد
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + activeSubscription.plan.durationInDays);
      
      activeSubscription.endDate = newEndDate;
      activeSubscription.startDate = new Date(); // تحديث تاريخ البدء أيضاً
      
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

      this.logger.log(` تم تمديد اشتراك الشركة ${companyId} حتى ${newEndDate.toDateString()}`);

      const result: ExtendSubscriptionResult = { 
        message: 'تم تمديد الاشتراك بنجاح', 
        subscription: updatedSubscription,
        details: {
          currentEmployees: currentEmployeeCount,
          maxAllowed: maxAllowed,
          remainingSlots: maxAllowed - currentEmployeeCount,
          newEndDate: updatedSubscription.endDate,
          planStatus: `الخطة الحالية (${maxAllowed} موظف) ${maxAllowed === currentEmployeeCount ? 'مساوية' : 'أعلى'} من عدد الموظفين الحاليين`,
          planName: activeSubscription.plan.name,
          durationAdded: `${activeSubscription.plan.durationInDays} يوم`
        }
      };
      return result;

    } catch (error: unknown) {
      this.logger.error(` فشل تجديد الاشتراك للشركة ${companyId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async validatePlanChange(companyId: string, newPlanId: string): Promise<PlanChangeValidation> {
    try {
      const currentSubscription = await this.getCompanySubscription(companyId);
      if (!currentSubscription) {
        throw new NotFoundException('لا يوجد اشتراك حالي للشركة');
      }
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      if (!newPlan) {
        throw new NotFoundException('الخطة الجديدة غير موجودة');
      }
      const currentEmployees = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      const currentPlanMax = currentSubscription.plan?.maxEmployees || 0;
      const newPlanMax = newPlan.maxEmployees;
      let action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID';
      let message = '';

      if (newPlanMax > currentPlanMax) {
        action = 'UPGRADE';
        message = `يمكنك الترقية إلى الخطة ${newPlan.name} التي تدعم ${newPlanMax} موظف`;
      } else if (newPlanMax === currentPlanMax) {
        action = 'RENEW';
        message = `يمكنك التجديد في نفس الخطة ${newPlan.name} لمدة سنة إضافية`;
      } else if (newPlanMax < currentPlanMax) {
        if (newPlanMax >= currentEmployees) {
          action = 'DOWNGRADE';
          message = `يمكنك التغيير إلى الخطة ${newPlan.name} ولكن سيكون الحد الأقصى ${newPlanMax} موظف`;
        } else {
          action = 'INVALID';
          message = `لا يمكن التغيير إلى خطة أقل - عدد الموظفين الحاليين (${currentEmployees}) يتجاوز الحد المسموح في الخطة الجديدة (${newPlanMax})`;
        }
      } else {
        action = 'INVALID';
        message = 'لا يمكن تغيير الخطة';
      }

      const canChange = action !== 'INVALID';

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
      this.logger.error(` فشل التحقق من تغيير الخطة: ${error instanceof Error ? error.message : String(error)}`);      
      throw error;
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

      this.logger.log(`تم جلب ${subscriptions.length} اشتراكًا ينتهي خلال ${daysThreshold} يوم`);
      return subscriptions;
    } catch (error: unknown) {
      this.logger.error(` فشل جلب الاشتراكات القريبة من الانتهاء: ${String(error)}`);
      throw new InternalServerErrorException('فشل جلب الاشتراكات القريبة من الانتهاء');
    }
  }

  async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
    try {
      return await this.subscriptionRepo.find({
        where: { company: { id: companyId } },
        relations: ['plan', 'paymentTransaction', 'activatedBySeller', 'activatedByAdmin'],
        order: { startDate: 'DESC' },
      });
    } catch (error: unknown) {
      this.logger.error(` فشل جلب سجل الاشتراكات للشركة ${companyId}`, error);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  async overrideEmployeeLimit(companyId: string, newMaxEmployees: number): Promise<void> {
    this.logger.log(`محاولة تجاوز حدود الموظفين للشركة: ${companyId} إلى ${newMaxEmployees}`);
    
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
    this.logger.log(` تم تحديث الحد الأقصى للموظفين إلى: ${newMaxEmployees}`);
  }

  async autoUpgradeEmployeeLimit(companyId: string, upgradePercentage: number = 50): Promise<void> {
    this.logger.log(`محاولة الترقية التلقائية لحدود الموظفين للشركة: ${companyId}`);
    
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
    
    this.logger.log(` تمت الترقية التلقائية من ${currentMax} إلى ${newMax} موظف`);
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
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(` فشل إرسال التنبيه إلى ${companyEmail}: ${errorMessage}`);
        }
      }
    } catch (error: unknown) {
      this.logger.error(' فشل فحص الاشتراكات القريبة من الانتهاء', error);
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
      return await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });
    } catch (error: unknown) {
      this.logger.error(`❌ Failed to get employee count for company ${companyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  async syncCompanySubscriptionStatus(companyId: string): Promise<void> {
    try {
      this.logger.log(`Syncing subscription status for company: ${companyId}`);
      
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
        this.logger.warn(`Company not found: ${companyId}`);
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
          
          this.logger.log(` Synced company ${companyId} status to ACTIVE with plan: ${latestSubscription.plan.name}`);
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
          
          this.logger.log(` Synced company ${companyId} status to INACTIVE - no active subscriptions`);
        }
      }
    } catch (error: unknown) {
      this.logger.error(` Failed to sync subscription status for company ${companyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async hasActiveSubscription(companyId: string): Promise<boolean> {
    try {
      const subscription = await this.getCompanySubscription(companyId);
      return !!subscription;
    } catch (error: unknown) {
      this.logger.error(` Failed to check active subscription for company ${companyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      return {
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
    } catch (error) {
      this.logger.error(` Debug failed for company ${companyId}: ${error}`);
      return { error: 'Debug failed' };
    }
  }
}