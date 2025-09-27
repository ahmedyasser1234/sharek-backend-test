import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { Request } from 'express';

interface CompanyRequest extends Request {
  user: { companyId: string };
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CompanyRequest>();
    const companyId = req.user.companyId;

    this.logger.debug(`🛡️ بدء التحقق من اشتراك الشركة: ${companyId}`);

    const subscription = await this.subscriptionService.getCompanySubscription(companyId);
    if (!subscription) {
      this.logger.warn(`🚫 لا يوجد اشتراك فعال للشركة: ${companyId}`);
      throw new ForbiddenException('No active subscription');
    }

    const now = new Date();
    if (subscription.endDate < now) {
      this.logger.warn(`📅 الاشتراك منتهي للشركة: ${companyId} | تاريخ الانتهاء: ${subscription.endDate.toISOString()}`);
      throw new ForbiddenException('Subscription expired');
    }

    const allowed = subscription.plan.maxEmployees;
    const current = await this.subscriptionService.companyRepo
      .createQueryBuilder('company')
      .leftJoin('company.employees', 'employee')
      .where('company.id = :id', { id: companyId })
      .getCount();

    this.logger.debug(`📊 عدد الموظفين الحالي: ${current} / الحد المسموح: ${allowed}`);

    if (current >= allowed) {
      this.logger.warn(`🚫 الشركة ${companyId} تجاوزت الحد المسموح للموظفين`);
      throw new ForbiddenException('Employee limit exceeded');
    }

    this.logger.log(`✅ تحقق الاشتراك ناجح للشركة: ${companyId}`);
    return true;
  }
}
