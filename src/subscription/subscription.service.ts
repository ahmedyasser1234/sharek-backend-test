import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
        message: 'يتطلب دفع',
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

async updateCompanyEmployeeLimit(companyId: string, newLimit: number): Promise<any> {
  try {
    const subscription = await this.getCompanySubscription(companyId);
    if (!subscription) throw new NotFoundException('لا يوجد اشتراك للشركة');

    subscription.customMaxEmployees = newLimit;
    await this.subscriptionRepo.save(subscription);

    this.logger.log(`✅ تم تعديل الحد المسموح للموظفين للشركة ${companyId} إلى ${newLimit}`);
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

 async getAllowedEmployees(companyId: string): Promise<number> {
  try {
    const subscription = await this.getCompanySubscription(companyId);
    return subscription?.customMaxEmployees ?? subscription?.plan?.maxEmployees ?? 0;
  } catch (error: unknown) {
    this.logger.error(` فشل حساب الحد المسموح للموظفين للشركة ${companyId}`, error as any);
    throw new InternalServerErrorException('فشل حساب الحد المسموح للموظفين');
  }
}

  async getUsage(companyId: string): Promise<any> {
    try {
      const subscription = await this.getCompanySubscription(companyId);
      const allowed: number = subscription?.plan?.maxEmployees || 0;
      const current: number = await this.companyService.countEmployees(companyId);
      const now = new Date();
      const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;

      return {
        allowed,
        current,
        remaining: allowed - current,
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
      const sub = await this.getCompanySubscription(companyId);
      if (!sub) throw new NotFoundException('لا يوجد اشتراك لإلغائه');
      sub.status = SubscriptionStatus.CANCELLED;
      await this.subscriptionRepo.save(sub);
      return { message: 'تم إلغاء الاشتراك بنجاح', subscription: sub };
    } catch (error: unknown) {
      this.logger.error(` فشل إلغاء الاشتراك للشركة ${companyId}`, error as any);
      throw error;
    }
  }

  async extendSubscription(companyId: string): Promise<any> {
    try {
      const sub = await this.getCompanySubscription(companyId);
      if (!sub || !sub.plan) throw new NotFoundException('لا يوجد اشتراك صالح للتمديد');
      sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
      await this.subscriptionRepo.save(sub);
      return { message: 'تم تمديد الاشتراك بنجاح', subscription: sub };
    } catch (error: unknown) {
      this.logger.error(` فشل تمديد الاشتراك للشركة ${companyId}`, error as any);
      throw error;
    }
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<any> {
    try {
      const sub = await this.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      if (!sub || !newPlan) throw new NotFoundException('الاشتراك أو الخطة غير موجودة');

      sub.plan = newPlan;
      sub.price = newPlan.price;
      sub.endDate = new Date(Date.now() + newPlan.durationInDays * 86400000);
      await this.subscriptionRepo.save(sub);

      return { message: 'تم تغيير الخطة بنجاح', subscription: sub };
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
