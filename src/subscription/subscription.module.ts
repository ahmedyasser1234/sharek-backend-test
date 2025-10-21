import { forwardRef, Module } from '@nestjs/common';import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { AdminSubscriptionController } from './AdminSubscription.Controller';
import { CompanySubscription } from './entities/company-subscription.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from '../plan/entities/plan.entity';
import { SubscriptionGuard } from './subscription.guard';
import { CompanyModule } from '../company/company.module';
import { PaymentTransaction } from '../payment/entities/payment-transaction.entity';
import { PaymentModule } from '../payment/payment.module';
import { JwtModule } from '@nestjs/jwt';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard'; 
import { PaymentProof } from '../payment/entities/payment-proof.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanySubscription,
      Company,
      Plan,
      PaymentTransaction,
      PaymentProof, 
    ]),
    forwardRef(() => CompanyModule),
     PaymentModule,
     JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }), 
  ],
  controllers: [
    SubscriptionController,
    AdminSubscriptionController,
  ],
  providers: [
    SubscriptionService,
    SubscriptionGuard,
    AdminJwtGuard,
  ],
  exports: [
    SubscriptionService,
    SubscriptionGuard,
  ],
})
export class SubscriptionModule {}
