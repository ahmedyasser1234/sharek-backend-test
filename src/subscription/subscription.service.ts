import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
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
    return this.planRepo.find();
  }

  async subscribe(companyId: string, planId: string): Promise<any> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const newPlan = await this.planRepo.findOne({ where: { id: planId } });
    if (!newPlan) throw new NotFoundException('Plan not found');

    if (newPlan.isTrial) {
      const previousTrial = await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          plan: { isTrial: true },
        },
        relations: ['plan', 'company'],
      });
      if (previousTrial)
        throw new BadRequestException('❌ لا يمكن استخدام الخطة التجريبية أكثر من مرة');
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
      price: newPlan.price,
      status: SubscriptionStatus.ACTIVE,
    };

    if (newPlan.price === 0) {
      const subscription = existingSub
        ? Object.assign(existingSub, subscriptionData)
        : this.subscriptionRepo.create(subscriptionData);

      const saved = await this.subscriptionRepo.save(subscription);
      return {
        message: '✅ تم الاشتراك في الخطة المجانية بنجاح',
        redirectToDashboard: true,
        subscription: saved,
      };
    }

    const provider = newPlan.paymentProvider;
    if (!provider) throw new BadRequestException('❌ مزود الدفع غير محدد في الخطة');

    const checkoutUrl = await this.paymentService.generateCheckoutUrl(
      provider,
      newPlan,
      companyId,
    );

    return {
      message: '💳 يتطلب دفع',
      redirectToPayment: true,
      checkoutUrl,
    };
  }

  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    return this.subscriptionRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoin('sub.company', 'company')
      .where('company.id = :companyId', { companyId })
      .orderBy('sub.startDate', 'DESC')
      .getOne();
  }

  async getAllowedEmployees(companyId: string): Promise<number> {
    const subscription = await this.getCompanySubscription(companyId);
    if (!subscription || !subscription.plan) return 0;
    return subscription.plan.maxEmployees;
  }

  async getUsage(companyId: string): Promise<any> {
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
  }

  async cancelSubscription(companyId: string): Promise<any> {
    const sub = await this.getCompanySubscription(companyId);
    if (!sub) throw new NotFoundException('❌ لا يوجد اشتراك لإلغائه');
    sub.status = SubscriptionStatus.CANCELLED;
    await this.subscriptionRepo.save(sub);
    return { message: '✅ تم إلغاء الاشتراك بنجاح', subscription: sub };
  }

  async extendSubscription(companyId: string): Promise<any> {
    const sub = await this.getCompanySubscription(companyId);
    if (!sub || !sub.plan)
      throw new NotFoundException('❌ لا يوجد اشتراك صالح للتمديد');
    sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
    await this.subscriptionRepo.save(sub);
    return { message: '✅ تم تمديد الاشتراك بنجاح', subscription: sub };
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<any> {
    const sub = await this.getCompanySubscription(companyId);
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!sub || !newPlan)
      throw new NotFoundException('❌ الاشتراك أو الخطة غير موجودة');
    sub.plan = newPlan;
    sub.price = newPlan.price;
    sub.endDate = new Date(Date.now() + newPlan.durationInDays * 86400000);
    await this.subscriptionRepo.save(sub);
    return { message: '✅ تم تغيير الخطة بنجاح', subscription: sub };
  }

  async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
    return this.subscriptionRepo.find({
      where: { company: { id: companyId } },
      relations: ['plan', 'paymentTransaction'],
      order: { startDate: 'DESC' },
    });
  }
}
