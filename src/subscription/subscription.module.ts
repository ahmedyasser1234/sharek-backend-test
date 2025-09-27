import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { CompanySubscription } from './entities/company-subscription.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from './entities/plan.entity';
import { SubscriptionGuard } from './subscription.guard'; 
import { CompanyModule } from '../company/company.module';
import { PaymentTransaction } from '../payment/entities/payment-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanySubscription,
      Company,
      Plan,
      PaymentTransaction, 
    ]),
    CompanyModule,
  ],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionGuard,
  ],
  exports: [
    SubscriptionService,
    SubscriptionGuard,
  ],
})
export class SubscriptionModule {}
