import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
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

    try {
      const subscription = await this.subscriptionService.getCompanySubscription(companyId);
      if (!subscription) {
        throw new ForbiddenException('No active subscription');
      }

      const now = new Date();
      if (subscription.endDate < now) {
        throw new ForbiddenException('Subscription expired');
      }

      const allowed = subscription.plan.maxEmployees;
      const current = await this.subscriptionService.companyRepo
        .createQueryBuilder('company')
        .leftJoin('company.employees', 'employee')
        .where('company.id = :id', { id: companyId })
        .getCount();

      if (current >= allowed) {
        throw new ForbiddenException('Employee limit exceeded');
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new InternalServerErrorException('Subscription verification failed');
    }
  }
}
