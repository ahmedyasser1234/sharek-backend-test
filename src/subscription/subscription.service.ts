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
    this.logger.log('📦 جلب جميع الخطط من قاعدة البيانات');
    return this.planRepo.find();
  }

async subscribe(companyId: string, planId: string): Promise<any> {
  this.logger.log(`📝 بدء الاشتراك: الشركة ${companyId} في الخطة ${planId}`);

  const company = await this.companyRepo.findOne({ where: { id: companyId } });
  if (!company) {
    this.logger.error(`❌ الشركة غير موجودة: ${companyId}`);
    throw new NotFoundException('Company not found');
  }

  const newPlan = await this.planRepo.findOne({ where: { id: planId } });
  if (!newPlan) {
    this.logger.error(`❌ الخطة غير موجودة: ${planId}`);
    throw new NotFoundException('Plan not found');
  }

  const planPrice = parseFloat(String(newPlan.price));
  this.logger.debug(`💰 سعر الخطة: ${planPrice} | النوع: ${typeof planPrice}`);

  if (isNaN(planPrice)) {
    this.logger.error(`❌ السعر غير صالح: ${newPlan.price}`);
    throw new BadRequestException('❌ السعر غير صالح للخطة');
  }

  if (newPlan.isTrial) {
    const previousTrial = await this.subscriptionRepo.findOne({
      where: {
        company: { id: companyId },
        plan: { isTrial: true },
      },
      relations: ['plan', 'company'],
    });
    if (previousTrial) {
      this.logger.warn(`⚠️ الشركة استخدمت الخطة التجريبية من قبل`);
      throw new BadRequestException('❌ لا يمكن استخدام الخطة التجريبية أكثر من مرة');
    }
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

  // ✅ اشتراك مجاني
  if (planPrice === 0) {
    this.logger.log('💡 الخطة مجانية، سيتم الاشتراك مباشرة');

    const subscription = existingSub
      ? Object.assign(existingSub, subscriptionData)
      : this.subscriptionRepo.create(subscriptionData);

    const saved = await this.subscriptionRepo.save(subscription);
    this.logger.log(`✅ تم حفظ الاشتراك: ${saved.id}`);

    company.subscriptionStatus = 'active';
    company.subscribedAt = new Date();
    company.planId = newPlan.id;
    company.paymentProvider = newPlan.paymentProvider?.toString() ?? '';

    const updatedCompany = await this.companyRepo.save(company);
    this.logger.log(`📦 تم تحديث بيانات الشركة: ${updatedCompany.id}`);
    this.logger.debug(`🔗 الخطة: ${updatedCompany.planId} | الحالة: ${updatedCompany.subscriptionStatus}`);

    return {
      message: '✅ تم الاشتراك في الخطة المجانية بنجاح',
      redirectToDashboard: true,
      subscription: saved,
    };
  }

  // ✅ اشتراك مدفوع
  if (planPrice > 0) {
    this.logger.log('💳 الخطة مدفوعة، جاري التحقق من مزود الدفع');

    const provider = newPlan.paymentProvider;
    if (!provider) {
      this.logger.error('❌ لا يوجد مزود دفع للخطة المدفوعة');
      throw new BadRequestException('❌ مزود الدفع مطلوب للخطط المدفوعة');
    }

    const checkoutUrl = await this.paymentService.generateCheckoutUrl(
      provider,
      newPlan,
      companyId,
    );

    this.logger.log(`🔗 تم توليد رابط الدفع: ${checkoutUrl}`);

    return {
      message: '💳 يتطلب دفع',
      redirectToPayment: true,
      checkoutUrl,
    };
  }

  // ✅ fallback لو السعر غير منطقي
  this.logger.warn('⚠️ لم يتم الاشتراك لأي سبب غير معروف');
  throw new BadRequestException('❌ لم يتم الاشتراك');
}


  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    this.logger.log(`📄 جلب الاشتراك الحالي للشركة: ${companyId}`);
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
    const allowed = subscription?.plan?.maxEmployees || 0;
    this.logger.log(`👥 الحد المسموح للموظفين: ${allowed}`);
    return allowed;
  }

  async getUsage(companyId: string): Promise<any> {
    this.logger.log(`📊 حساب استخدام الشركة: ${companyId}`);

    const subscription = await this.getCompanySubscription(companyId);
    const allowed: number = subscription?.plan?.maxEmployees || 0;
    const current: number = await this.companyService.countEmployees(companyId);
    const now = new Date();
    const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;

    this.logger.log(`✅ الشركة تستخدم ${current}/${allowed} موظف | الاشتراك منتهي: ${isExpired}`);

    return {
      allowed,
      current,
      remaining: allowed - current,
      currentSubscription: subscription,
      isExpired,
    };
  }

  async cancelSubscription(companyId: string): Promise<any> {
    this.logger.log(`🛑 إلغاء اشتراك الشركة: ${companyId}`);
    const sub = await this.getCompanySubscription(companyId);
    if (!sub) throw new NotFoundException('❌ لا يوجد اشتراك لإلغائه');
    sub.status = SubscriptionStatus.CANCELLED;
    await this.subscriptionRepo.save(sub);
    this.logger.log(`✅ تم إلغاء الاشتراك: ${sub.id}`);
    return { message: '✅ تم إلغاء الاشتراك بنجاح', subscription: sub };
  }

  async extendSubscription(companyId: string): Promise<any> {
    this.logger.log(`⏳ تمديد اشتراك الشركة: ${companyId}`);
    const sub = await this.getCompanySubscription(companyId);
    if (!sub || !sub.plan)
      throw new NotFoundException('❌ لا يوجد اشتراك صالح للتمديد');
    sub.endDate = new Date(sub.endDate.getTime() + sub.plan.durationInDays * 86400000);
    await this.subscriptionRepo.save(sub);
    this.logger.log(`✅ تم تمديد الاشتراك حتى: ${sub.endDate.toISOString()}`);
    return { message: '✅ تم تمديد الاشتراك بنجاح', subscription: sub };
  }

  async changeSubscriptionPlan(companyId: string, newPlanId: string): Promise<any> {
    this.logger.log(`🔄 تغيير خطة اشتراك الشركة: ${companyId} إلى الخطة: ${newPlanId}`);
    const sub = await this.getCompanySubscription(companyId);
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!sub || !newPlan)
      throw new NotFoundException('❌ الاشتراك أو الخطة غير موجودة');
    sub.plan = newPlan;
    sub.price = newPlan.price;
    sub.endDate = new Date(Date.now() + newPlan.durationInDays * 86400000);
    await this.subscriptionRepo.save(sub);
    this.logger.log(`✅ تم تغيير الخطة بنجاح إلى: ${newPlan.name}`);
    return { message: '✅ تم تغيير الخطة بنجاح', subscription: sub };
  }

 async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
  this.logger.log(`📜 جلب سجل الاشتراكات للشركة: ${companyId}`);

  const subscriptions = await this.subscriptionRepo.find({
    where: { company: { id: companyId } },
    relations: ['plan', 'paymentTransaction'],
    order: { startDate: 'DESC' },
  });

  this.logger.log(`📜 تم جلب ${subscriptions.length} اشتراك`);

  return subscriptions;
}
}