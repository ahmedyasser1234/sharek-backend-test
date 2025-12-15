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

      const allowed = subscription.customMaxEmployees || subscription.plan.maxEmployees;
      const current = await this.subscriptionService.getCurrentEmployeeCount(companyId);

      if (current >= allowed) {
        throw new ForbiddenException('Employee limit exceeded');
      }

      return true;

    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Subscription verification failed for company ${companyId}: ${errorMessage}`);
      throw new InternalServerErrorException('Subscription verification failed');
    }
  }
}