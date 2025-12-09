import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SupadminService } from './supadmin.service';
import { SupadminController } from './supadmin.controller';
import { Supadmin } from './entities/supadmin.entity';
import { SupadminToken } from './entities/supadmin-token.entity';
import { SupadminJwtService } from './auth/supadmin-jwt.service';
import { SupadminJwtGuard } from './auth/supadmin-jwt.guard';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { Manager } from './entities/manager.entity';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supadmin,
      SupadminToken,
      Company,
      Employee,
      CompanySubscription,
      Plan,
      PaymentProof,
      Manager,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'supadmin-secret',
      signOptions: { expiresIn: '15m' },
    }),
    SubscriptionModule,
    PaymentModule,
  ],
  controllers: [SupadminController],
  providers: [
    SupadminService,
    SupadminJwtService,
    SupadminJwtGuard,
  ],
  exports: [
    SupadminService,
    SupadminJwtService,
    SupadminJwtGuard,
  ],
})
export class SupadminModule {}