import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySubscription } from './entities/company-subscription.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from '../plan/entities/plan.entity';

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
  ) {}

  async getPlans(): Promise<Plan[]> {
    this.logger.log('📦 جلب جميع الخطط المتاحة');
    return this.planRepo.find();
  }

  async subscribe(companyId: string, planId: string): Promise<any> {
    this.logger.log(`📝 محاولة اشتراك الشركة ${companyId} في الخطة ${planId}`);

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      this.logger.warn(`❌ الشركة غير موجودة: ${companyId}`);
      throw new NotFoundException('Company not found');
    }

    const newPlan = await this.planRepo.findOne({ where: { id: planId } });
    if (!newPlan) {
      this.logger.warn(`❌ الخطة غير موجودة: ${planId}`);
      throw new NotFoundException('Plan not found');
    }

    // ✅ منع استخدام الخطة التجريبية أكثر من مرة
    if (newPlan.isTrial) {
      const previousTrial = await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          plan: { isTrial: true },
        },
        relations: ['plan', 'company'],
      });

      if (previousTrial) {
        this.logger.warn(`⚠️ الشركة ${companyId} استخدمت الخطة التجريبية من قبل`);
        throw new BadRequestException('❌ لا يمكن استخدام الخطة التجريبية أكثر من مرة');
      }
    }

    const existingSub = await this.subscriptionRepo.findOne({
      where: { company: { id: companyId } },
      order: { startDate: 'DESC' },
      relations: ['plan'],
    });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + newPlan.durationInDays);

    if (existingSub) {
      existingSub.plan = newPlan;
      existingSub.startDate = startDate;
      existingSub.endDate = endDate;
      existingSub.price = newPlan.price;

      const updated = await this.subscriptionRepo.save(existingSub);
      this.logger.log(`✅ تم ترقية اشتراك الشركة ${companyId} إلى الخطة ${newPlan.name}`);
      return {
        message: '✅ تم ترقية الاشتراك بنجاح',
        redirectToDashboard: true,
        subscription: updated,
      };
    }

    const subscription = this.subscriptionRepo.create({
      company,
      plan: newPlan,
      startDate,
      endDate,
      price: newPlan.price,
    });

    const saved = await this.subscriptionRepo.save(subscription);
    this.logger.log(`✅ تم إنشاء اشتراك جديد للشركة ${companyId} في الخطة ${newPlan.name}`);
    return {
      message: '✅ تم الاشتراك بنجاح',
      redirectToDashboard: true,
      subscription: saved,
    };
  }

  async getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
    this.logger.debug(`📄 جلب اشتراك الشركة: ${companyId}`);
    return this.subscriptionRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoin('sub.company', 'company')
      .where('company.id = :companyId', { companyId })
      .orderBy('sub.startDate', 'DESC')
      .getOne();
  }

  async getAllowedEmployees(companyId: string): Promise<number> {
    this.logger.debug(`📊 حساب عدد الموظفين المسموح للشركة: ${companyId}`);
    const subscription = await this.getCompanySubscription(companyId);
    if (!subscription || !subscription.plan) {
      this.logger.warn(`⚠️ لا يوجد اشتراك أو خطة للشركة: ${companyId}`);
      return 0;
    }
    this.logger.log(`✅ الشركة ${companyId} مسموح لها بـ ${subscription.plan.maxEmployees} موظف`);
    return subscription.plan.maxEmployees;
  }
}
