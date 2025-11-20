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

  async getPlans(): Promise<Plan[]> {
    try {
      return await this.planRepo.find();
    } catch (error: unknown) {
      this.logger.error(' فشل جلب الخطط', error as any);
      throw new InternalServerErrorException('فشل جلب الخطط');
    }
  }

  async subscribe(companyId: string, planId: string, isAdminOverride = false): Promise<any> {
    try {
      this.logger.log(` بدء الاشتراك: الشركة ${companyId} في الخطة ${planId}`);

      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Company not found');

      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      if (!newPlan) throw new NotFoundException('Plan not found');

      const planPrice = parseFloat(String(newPlan.price));
      if (isNaN(planPrice)) throw new BadRequestException('السعر غير صالح للخطة');

      if (newPlan.isTrial) {
        const previousTrial = await this.subscriptionRepo.findOne({
          where: {
            company: { id: companyId },
            plan: { isTrial: true },
          },
          relations: ['plan', 'company'],
        });
        if (previousTrial) throw new BadRequestException('لا يمكن استخدام الخطة التجريبية أكثر من مرة');
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + newPlan.durationInDays);

      const existingSub = await this.subscriptionRepo.findOne({
        where: { company: { id: companyId } },
        order: { startDate: 'DESC' },
        relations: ['plan'],
      });

      const subscriptionData: Partial<CompanySubscription> = {
        company,
        plan: newPlan,
        startDate,
        endDate,
        price: planPrice,
        status: SubscriptionStatus.ACTIVE,
      };

      if (planPrice === 0 || isAdminOverride) {
        const subscription = existingSub
          ? Object.assign(existingSub, subscriptionData)
          : this.subscriptionRepo.create(subscriptionData);

        const saved = await this.subscriptionRepo.save(subscription);

        company.subscriptionStatus = 'active';
        company.subscribedAt = new Date();
        company.planId = newPlan.id;
        company.paymentProvider = newPlan.paymentProvider?.toString() ?? '';
        await this.companyRepo.save(company);

        if (isAdminOverride) {
          await this.updateRelatedPaymentProof(companyId, planId);
        }

        return {
          message: isAdminOverride
            ? ' تم تفعيل الاشتراك يدويًا بواسطة الأدمن'
            : ' تم الاشتراك في الخطة المجانية بنجاح',
          redirectToDashboard: true,
          subscription: saved,
        };
      }

      if (planPrice > 0) {
        const provider = newPlan.paymentProvider;
        if (!provider) throw new BadRequestException('مزود الدفع مطلوب للخطط المدفوعة');

        const checkoutUrl = await this.paymentService.generateCheckoutUrl(
          provider,
          newPlan,
          companyId,
        );

        return {
          message: ' يتطلب دفع',
          redirectToPayment: true,
          checkoutUrl,
        };
      }

      throw new BadRequestException('لم يتم الاشتراك');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل الاشتراك: ${msg}`);
      throw error;
    }
  }

  async validatePlanChange(companyId: string, newPlanId: string): Promise<{
    canChange: boolean;
    message: string;
    currentPlanMax: number;
    newPlanMax: number;
    currentEmployees: number;
    action: 'UPGRADE' | 'RENEW' | 'DOWNGRADE' | 'INVALID';
  }> {
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

      return {
        canChange,
        message,
        currentPlanMax,
        newPlanMax,
        currentEmployees,
        action
      };
    } catch (error: unknown) {
      this.logger.error(`فشل التحقق من تغيير الخطة: ${error instanceof Error ? error.message : String(error)}`);      
      throw error;
    }
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<any> {
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

      // منع التغيير من خطة أعلى إلى خطة أقل
      if (validation.action === 'DOWNGRADE') {
        throw new BadRequestException(
          `لا يمكن التغيير من خطة ${currentSubscription.plan?.name} (${validation.currentPlanMax} موظف) إلى خطة ${newPlan.name} (${validation.newPlanMax} موظف) - غير مسموح بالانتقال لخطة أقل`
        );
      }

      const currentEmployees = validation.currentEmployees;
      const currentPlanMax = validation.currentPlanMax;
      const newPlanMax = validation.newPlanMax;
      const now = new Date();
      const endDate = new Date(currentSubscription.endDate);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const newDurationInDays = daysRemaining + 365;
      const oldPlanName = currentSubscription.plan?.name;
      const oldMaxEmployees = currentPlanMax;
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlan.price;
      currentSubscription.endDate = new Date(now.getTime() + newDurationInDays * 86400000);
      
      if (newPlanMax > oldMaxEmployees) {
        currentSubscription.customMaxEmployees = newPlanMax;
      }

      await this.subscriptionRepo.save(currentSubscription);

      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (company) {
        company.planId = newPlan.id;
        await this.companyRepo.save(company);
      }

      return { 
        message: 'تم تغيير الخطة بنجاح', 
        subscription: currentSubscription,
        details: {
          action: validation.action,
          oldPlan: oldPlanName,
          newPlan: newPlan.name,
          currentEmployees: currentEmployees,
          oldMaxAllowed: oldMaxEmployees,
          newMaxAllowed: newPlanMax,
          daysRemaining: daysRemaining,
          newDuration: newDurationInDays,
          newEndDate: currentSubscription.endDate,
          employeeLimitUpdated: newPlanMax > oldMaxEmployees
        }
      };

    } catch (error: unknown) {
      this.logger.error(`فشل تغيير الخطة للشركة ${companyId}`, error as any);
      throw error;
    }
  }

  async requestPlanChange(companyId: string, newPlanId: string): Promise<any> {
    try {
      const validation = await this.validatePlanChange(companyId, newPlanId);
      
      if (!validation.canChange) {
        return {
          success: false,
          message: validation.message,
          validation: validation
        };
      }

      // منع الانتقال من خطة أعلى إلى أقل
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
          currentPlan: currentSubscription.plan?.name,
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
      this.logger.error(`فشل طلب تغيير الخطة للشركة ${companyId}`, error as any);
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
      
      } else {
        this.logger.warn(` لم يتم العثور على proof pending للشركة ${companyId} والخطة ${planId}`);
      }
    } catch (error) {
      this.logger.error(` فشل تحديث حالة الـ Proof: ${String(error)}`);
    }
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
      return await this.subscriptionRepo
        .createQueryBuilder('sub')
        .leftJoinAndSelect('sub.plan', 'plan')
        .leftJoin('sub.company', 'company')
        .where('company.id = :companyId', { companyId })
        .orderBy('sub.startDate', 'DESC')
        .getOne();
    } catch (error: unknown) {
      this.logger.error(` فشل جلب الاشتراك للشركة ${companyId}`, error as any);
      throw new InternalServerErrorException('فشل جلب الاشتراك');
    }
  }

  async getAllowedEmployees(companyId: string): Promise<{ maxAllowed: number; remaining: number; current: number }> {
    try {
      this.logger.debug(` التحقق من الحد المسموح للموظفين للشركة: ${companyId}`);
      
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
      this.logger.debug(` التحقق من إمكانية إضافة موظف للشركة: ${companyId}`);
      
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
      this.logger.error(` فشل حساب استخدام الشركة ${companyId}`, error as any);
      throw new InternalServerErrorException('فشل حساب الاستخدام');
    }
  }

  async cancelSubscription(companyId: string): Promise<any> {
    try {
      // جلب جميع الاشتراكات النشطة
      const subscriptions = await this.subscriptionRepo.find({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan', 'company']
      });

      if (subscriptions.length === 0) {
        this.logger.warn(` لا يوجد اشتراكات نشطة للشركة: ${companyId}`);
        throw new NotFoundException('لا يوجد اشتراكات نشطة للشركة');
      }

      // حذف جميع الاشتراكات القديمة بدلاً من تعطيلها فقط
      await this.subscriptionRepo.delete({
        company: { id: companyId }
      });

      this.logger.log(` تم حذف جميع الاشتراكات القديمة للشركة: ${companyId}`);

      // تحديث حالة الشركة
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (company) {
        company.subscriptionStatus = 'inactive';
        company.planId = null;
        company.paymentProvider = '';
        company.subscribedAt = null as unknown as Date;
        
        await this.companyRepo.save(company);
        this.logger.debug(` تم تحديث حالة الشركة إلى inactive`);
      }

      const planNames = [...new Set(subscriptions.map(sub => sub.plan?.name).filter(Boolean))];

      const result = { 
        message: ' تم إلغاء وحذف جميع اشتراكات الشركة بنجاح', 
        deletedSubscriptions: subscriptions.length,
        disconnectedPlans: planNames,
        companyStatus: 'inactive - غير قادرة على إضافة موظفين',
        note: 'الشركة لن تتمكن من إضافة موظفين جدد حتى تشترك في خطة جديدة'
      };

      return result;

    } catch (error: unknown) {
      this.logger.error(` فشل إلغاء الاشتراكات للشركة ${companyId}`, error as any);
      
      if (error instanceof NotFoundException) {
        this.logger.warn(` الشركة ${companyId} ليس لديها اشتراكات نشطة لإلغائها`);
        throw error;
      }
      
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  async extendSubscription(companyId: string, options?: { forceExtend?: boolean }): Promise<any> {
    try {
      const sub = await this.getCompanySubscription(companyId);
      if (!sub || !sub.plan) {
        throw new NotFoundException('لا يوجد اشتراك صالح للتمديد');
      }

      const allowedEmployees = await this.getAllowedEmployees(companyId);
      const currentEmployeeCount = allowedEmployees.current;
      const maxAllowed = allowedEmployees.maxAllowed;

      // التحقق من عدم التمديد لخطة أقل
      const currentPlanMax = sub.plan.maxEmployees;
      if (maxAllowed < currentPlanMax) {
        throw new BadRequestException(
          `لا يمكن تمديد الاشتراك - الخطة الحالية تدعم ${maxAllowed} موظف بينما الخطة الأصلية كانت ${currentPlanMax} موظف.\n\n` +
          `يجب الاشتراك في خطة تدعم ${currentEmployeeCount} موظف أو أكثر.`
        );
      }

      if (options?.forceExtend) {
        this.logger.warn(` تم تمديد الاشتراك إجبارياً للشركة ${companyId}`);
        sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
        await this.subscriptionRepo.save(sub);
        
        return { 
          message: 'تم تمديد الاشتراك بنجاح (وضع إجباري)', 
          subscription: sub,
          warning: 'تم تمديد الاشتراك رغم تجاوز الحد الأقصى للموظفين',
          details: {
            currentEmployees: currentEmployeeCount,
            maxAllowed: maxAllowed,
            exceededBy: currentEmployeeCount - maxAllowed
          }
        };
      }

      if (maxAllowed < currentEmployeeCount) {
        this.logger.error(` رفض التمديد - الخطة غير كافية:
          - الخطة الحالية: ${maxAllowed} موظف
          - الموظفين الحاليين: ${currentEmployeeCount}
          - العجز: ${currentEmployeeCount - maxAllowed} موظف`);

        throw new BadRequestException(
          `لا يمكن تمديد الاشتراك - عدد الموظفين الحاليين (${currentEmployeeCount}) يتجاوز الحد المسموح في الخطة الحالية (${maxAllowed}).\n\n` +
          `يجب الاشتراك في خطة تدعم ${currentEmployeeCount} موظف أو أكثر.\n\n` +
          `الحلول المقترحة:\n` +
          `1. ترقية الخطة إلى خطة تدعم ${currentEmployeeCount} موظف أو أكثر\n` +
          `2. حذف بعض الموظفين غير النشطين لتقليل العدد إلى ${maxAllowed} موظف\n` +
          `3. استخدام التمديد الإجباري (للمشرفين فقط)`
        );
      }

      if (maxAllowed >= currentEmployeeCount) {
        const oldEndDate = sub.endDate;
        sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
        await this.subscriptionRepo.save(sub);
        
        this.logger.log(` تم تمديد الاشتراك للشركة ${companyId}
          - من: ${oldEndDate.toISOString().split('T')[0]}
          - إلى: ${sub.endDate.toISOString().split('T')[0]}
          - المدة المضافة: ${sub.plan.durationInDays} يوم`);

        return { 
          message: 'تم تمديد الاشتراك بنجاح', 
          subscription: sub,
          details: {
            currentEmployees: currentEmployeeCount,
            maxAllowed: maxAllowed,
            remainingSlots: maxAllowed - currentEmployeeCount,
            newEndDate: sub.endDate,
            planStatus: `الخطة الحالية (${maxAllowed} موظف) ${maxAllowed === currentEmployeeCount ? 'مساوية' : 'أعلى'} من عدد الموظفين الحاليين`,
            planName: sub.plan.name,
            durationAdded: `${sub.plan.durationInDays} يوم`
          }
        };
      }

      throw new BadRequestException('لا يمكن تمديد الاشتراك - حالة غير متوقعة');

    } catch (error: unknown) {
      this.logger.error(` فشل تمديد الاشتراك للشركة ${companyId}`, error as any);
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
        .where('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('sub.endDate <= :thresholdDate', { thresholdDate })
        .orderBy('sub.endDate', 'ASC')
        .getMany();

      this.logger.log(` تم جلب ${subscriptions.length} اشتراكًا ينتهي خلال ${daysThreshold} يوم`);
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
        relations: ['plan', 'paymentTransaction'],
        order: { startDate: 'DESC' },
      });
    } catch (error: unknown) {
      this.logger.error(` فشل جلب سجل الاشتراكات للشركة ${companyId}`, error as any);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  async overrideEmployeeLimit(companyId: string, newMaxEmployees: number): Promise<void> {
    this.logger.log(` محاولة تجاوز حدود الموظفين للشركة: ${companyId} إلى ${newMaxEmployees}`);
    
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
    this.logger.log(` محاولة الترقية التلقائية لحدود الموظفين للشركة: ${companyId}`);
    
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
      this.logger.error(' فشل فحص الاشتراكات القريبة من الانتهاء', error as any);
    }
  }

  private generateRenewalUrl(companyId: string, planId: string, currentEndDate: Date, durationInDays: number): string {
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + durationInDays);
    const formattedDate = newEndDate.toISOString().split('T')[0];
    return `http://localhost:3000/renew-subscription?companyId=${companyId}&planId=${planId}&newEndDate=${formattedDate}`;
  }
}