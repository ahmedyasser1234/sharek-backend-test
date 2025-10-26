import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

import { Company } from '../company/entities/company.entity';
import { CompanyToken } from '../company/auth/entities/company-token.entity';
import { CompanyLoginLog } from '../company/auth/entities/company-login-log.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Employee } from '../employee/entities/employee.entity';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Plan } from '../plan/entities/plan.entity';
import { EmployeeImage } from '../employee/entities/EmployeeImage.entity';
import { Visit } from '../employee/entities/visit.entity';
import { PaymentTransaction } from '../payment/entities/payment-transaction.entity';
import { Admin } from '../admin/entities/admin.entity';
import { PaymentProof } from '../payment/entities/payment-proof.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyToken,
      CompanyLoginLog,
      CompanySubscription,
      Employee,
      EmployeeCard,
      Plan,
      EmployeeImage,
      Visit,
      PaymentTransaction,
      Admin,
      PaymentProof,
    ]),
  ],
  providers: [BackupService],
  controllers: [BackupController],
})
export class BackupModule {}