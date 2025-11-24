import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SellerController } from './manager.controller';
import { SellerService } from './manager.service';
import { ManagerJwtService } from './auth/manager-jwt.service';
import { ManagerJwtGuard } from './auth/manager-jwt.guard';
import { Manager } from './entities/manager.entity';
import { ManagerToken } from './entities/manager-token.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PaymentModule } from '../payment/payment.module';
import { Admin } from './entities/admin.entity'; 


@Module({
  imports: [
    TypeOrmModule.forFeature([
      Manager,
      ManagerToken,
      Company,
      Employee,
      CompanySubscription,
      Plan,
      PaymentProof,
      Admin, 
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'manager-secret-key',
      signOptions: { expiresIn: '30m' },
    }),
    SubscriptionModule, 
    PaymentModule,      
  ],
  controllers: [SellerController],
  providers: [
    SellerService,
    ManagerJwtService,
    ManagerJwtGuard,
  ],
  exports: [SellerService, ManagerJwtGuard],
})
export class ManagerModule {}