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
      this.logger.log(' جلب جميع الخطط من قاعدة البيانات');
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
      
        this.logger.log(` تم تحديث حالة الـ Proof: ${latestProof.id} من pending إلى approved`);
        this.logger.log(` الشركة: ${latestProof.company.name}, الخطة: ${latestProof.plan.name}`);
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

      this.logger.log(` تم تعديل الحد المسموح للموظفين للشركة ${companyId} إلى ${newLimit}`);
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

    this.logger.debug(` بيانات الاشتراك المستخدم في التحقق:
      - شركة: ${companyId}
      - خطة: ${activeSubscription.plan?.name || 'غير معروف'}
      - ID الخطة: ${activeSubscription.plan?.id}
      - maxEmployees في الخطة: ${activeSubscription.plan?.maxEmployees}
      - customMaxEmployees: ${activeSubscription.customMaxEmployees || 'غير محدد'}
      - حالة الاشتراك: ${activeSubscription.status}`);

    const currentEmployees = await this.employeeRepo.count({
      where: { company: { id: companyId } }
    });

    const maxAllowed = activeSubscription.customMaxEmployees ?? activeSubscription.plan?.maxEmployees ?? 0;
    const remaining = Math.max(0, maxAllowed - currentEmployees);

    this.logger.debug(` إحصائيات الموظفين للشركة ${companyId}:
      - الموظفين الحاليين: ${currentEmployees}
      - الحد الأقصى: ${maxAllowed}
      - المتبقي: ${remaining}
      - حالة الاشتراك: ${activeSubscription.status}
      - مصدر الحد الأقصى: ${activeSubscription.customMaxEmployees ? 'customMaxEmployees' : 'plan.maxEmployees'}`);

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

      this.logger.debug(`نتيجة التحقق للشركة ${companyId}:
        - يمكن الإضافة: ${canAdd}
        - الحالي: ${currentEmployees}
        - المسموح: ${maxAllowed}
        - المتبقي: ${remaining}`);

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
    this.logger.log(` بدء عملية إلغاء اشتراك الشركة: ${companyId}`);

    try {
      this.logger.debug(` البحث عن اشتراكات الشركة: ${companyId}`);
      const subscriptions = await this.subscriptionRepo.find({
        where: { 
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan', 'company']
      });

      this.logger.log(` تم العثور على ${subscriptions.length} اشتراك نشط للشركة`);

      if (subscriptions.length === 0) {
        this.logger.warn(` لا يوجد اشتراكات نشطة للشركة: ${companyId}`);
        throw new NotFoundException('لا يوجد اشتراكات نشطة للشركة');
      }

      this.logger.log(` بدء تحديث ${subscriptions.length} اشتراك إلى inactive`);
      
      const updatePromises = subscriptions.map(async (sub, index) => {
        this.logger.debug(` تحديث الاشتراك ${index + 1}: 
          - ID: ${sub.id}
          - الحالة السابقة: ${sub.status}
          - الخطة: ${sub.plan?.name}
          - الشركة: ${sub.company?.name}`);
        
        const oldStatus = sub.status;
        sub.status = 'inactive' as SubscriptionStatus;
        
        await this.subscriptionRepo.save(sub);
        this.logger.debug(` تم تحديث الاشتراك ${sub.id} من ${oldStatus} إلى inactive`);
        
        return sub;
      });

      await Promise.all(updatePromises);
      this.logger.log(` تم تحديث ${subscriptions.length} اشتراك إلى inactive بنجاح`);

      const company = subscriptions[0].company;
      if (company) {
        this.logger.debug(` تحديث حالة الشركة: ${company.id} من ${company.subscriptionStatus} إلى inactive`);
        
        const oldStatus = company.subscriptionStatus;
        company.subscriptionStatus = 'inactive';
        company.planId = null;
        company.paymentProvider = '';
        company.subscribedAt = null as unknown as Date; 
        
        await this.companyRepo.save(company);
        this.logger.debug(` تم تحديث حالة الشركة من ${oldStatus} إلى inactive`);
      }

      const planNames = [...new Set(subscriptions.map(sub => sub.plan?.name).filter(Boolean))];
      this.logger.debug(` الخطط التي تم إلغاء تفعيلها: ${planNames.join(', ')}`);

      this.logger.log(` النتيجة النهائية:
        - الاشتراكات المحدثة: ${subscriptions.length}
        - الخطط التي تم إلغاء تفعيلها: ${planNames.length}
        - حالة الشركة: inactive`);

      const result = { 
        message: ' تم إلغاء جميع اشتراكات الشركة بنجاح', 
        updatedSubscriptions: subscriptions.length,
        disconnectedPlans: planNames,
        companyStatus: 'inactive - غير قادرة على إضافة موظفين',
        note: 'الشركة لن تتمكن من إضافة موظفين جدد حتى تشترك في خطة جديدة'
      };

      this.logger.log(` عملية إلغاء الاشتراك اكتملت بنجاح للشركة: ${companyId}`);
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
    this.logger.log(` بدء تمديد الاشتراك للشركة: ${companyId}`);
    
    const sub = await this.getCompanySubscription(companyId);
    if (!sub || !sub.plan) {
      throw new NotFoundException('لا يوجد اشتراك صالح للتمديد');
    }

    this.logger.log(` بيانات الخطة الحالية:
      - اسم الخطة: ${sub.plan.name}
      - الحد الأقصى: ${sub.plan.maxEmployees} موظف
      - مدة الخطة: ${sub.plan.durationInDays} يوم
      - ID الخطة: ${sub.plan.id}
      - customMaxEmployees: ${sub.customMaxEmployees || 'غير محدد'}`);

    const allowedEmployees = await this.getAllowedEmployees(companyId);
    const currentEmployeeCount = allowedEmployees.current;
    const maxAllowed = allowedEmployees.maxAllowed;

    this.logger.log(` التحقق من إمكانية التمديد:
      - عدد الموظفين الحاليين: ${currentEmployeeCount}
      - الحد الأقصى في الخطة: ${maxAllowed}
      - القوة الإجبارية: ${options?.forceExtend ? 'نعم' : 'لا'}
      - حالة المقارنة: ${maxAllowed >= currentEmployeeCount ? 'مسموح' : 'ممنوع'}`);

    this.logger.log(` مقارنة الخطة مع الموظفين:
      - maxAllowed (${maxAllowed}) ${maxAllowed >= currentEmployeeCount ? '>=' : '<'} currentEmployeeCount (${currentEmployeeCount})
      - النتيجة: ${maxAllowed >= currentEmployeeCount ? 'يمكن التمديد' : 'يجب ترقية الخطة'}`);

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
      this.logger.log(`✅ الخطة مناسبة للتمديد:
        - الخطة: ${maxAllowed} موظف
        - الموظفين: ${currentEmployeeCount}
        - المسموح بإضافته: ${maxAllowed - currentEmployeeCount} موظف`);

      const oldEndDate = sub.endDate;
      sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
      await this.subscriptionRepo.save(sub);
      
      this.logger.log(`✅ تم تمديد الاشتراك للشركة ${companyId}
        - من: ${oldEndDate}
        - إلى: ${sub.endDate}
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

    // حالة احتياطية - لا يجب الوصول إليها
    throw new BadRequestException('لا يمكن تمديد الاشتراك - حالة غير متوقعة');

  } catch (error: unknown) {
    this.logger.error(`❌ فشل تمديد الاشتراك للشركة ${companyId}`, error as any);
    throw error;
  }
}


 async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<any> {
    try {
      this.logger.log(` بدء تغيير الخطة للشركة: ${companyId} إلى الخطة: ${newPlanId}`);
      
      const sub = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      
      if (!sub || !newPlan) {
        throw new NotFoundException('الاشتراك أو الخطة غير موجودة');
      }

      const allowedEmployees = await this.getAllowedEmployees(companyId);
      const currentEmployeeCount = allowedEmployees.current;

      this.logger.log(` بيانات التحقق من تغيير الخطة:
        - الخطة الحالية: ${sub.plan?.name} (${sub.plan?.maxEmployees} موظف)
        - الخطة الجديدة: ${newPlan.name} (${newPlan.maxEmployees} موظف)
        - عدد الموظفين الحاليين: ${currentEmployeeCount}
        - المقارنة: ${newPlan.maxEmployees >= currentEmployeeCount ? 'مناسبة' : 'غير مناسبة'}`);

      if (newPlan.maxEmployees < currentEmployeeCount) {
        this.logger.error(` رفض تغيير الخطة - الخطة الجديدة غير كافية:
          - الخطة الجديدة: ${newPlan.name} (${newPlan.maxEmployees} موظف)
          - الموظفين الحاليين: ${currentEmployeeCount}
          - العجز: ${currentEmployeeCount - newPlan.maxEmployees} موظف`);

        throw new BadRequestException(
          `لا يمكن تغيير الخطة - عدد الموظفين الحاليين (${currentEmployeeCount}) يتجاوز الحد المسموح في الخطة الجديدة (${newPlan.maxEmployees}).\n\n` +
          `يجب اختيار خطة تدعم ${currentEmployeeCount} موظف أو أكثر.\n\n` +
          `الحلول المقترحة:\n` +
          `1. اختيار خطة أعلى تدعم ${currentEmployeeCount} موظف أو أكثر\n` +
          `2. حذف بعض الموظفين غير النشطين لتقليل العدد إلى ${newPlan.maxEmployees} موظف\n` +
          `3. البقاء على الخطة الحالية`
        );
      }

      if (newPlan.maxEmployees >= currentEmployeeCount) {
        this.logger.log(`الخطة الجديدة مناسبة للتغيير:
          - الخطة: ${newPlan.name} (${newPlan.maxEmployees} موظف)
          - الموظفين: ${currentEmployeeCount}
          - المسموح بإضافته: ${newPlan.maxEmployees - currentEmployeeCount} موظف`);

        const oldPlanName = sub.plan?.name;
        const oldMaxEmployees = sub.plan?.maxEmployees;

        sub.plan = newPlan;
        sub.price = newPlan.price;
        sub.endDate = new Date(Date.now() + newPlan.durationInDays * 86400000);
        await this.subscriptionRepo.save(sub);

        this.logger.log(` تم تغيير الخطة بنجاح للشركة ${companyId}
          - من: ${oldPlanName} (${oldMaxEmployees} موظف)
          - إلى: ${newPlan.name} (${newPlan.maxEmployees} موظف)
          - المدة الجديدة: ${newPlan.durationInDays} يوم`);

        return { 
          message: 'تم تغيير الخطة بنجاح', 
          subscription: sub,
          details: {
            oldPlan: oldPlanName,
            newPlan: newPlan.name,
            currentEmployees: currentEmployeeCount,
            newMaxAllowed: newPlan.maxEmployees,
            remainingSlots: newPlan.maxEmployees - currentEmployeeCount,
            newEndDate: sub.endDate
          }
        };
      }

      throw new BadRequestException('لا يمكن تغيير الخطة - حالة غير متوقعة');

    } catch (error: unknown) {
      this.logger.error(` فشل تغيير الخطة للشركة ${companyId}`, error as any);
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