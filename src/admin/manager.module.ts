import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { ManagerJwtService } from './auth/manager-jwt.service';
import { ManagerJwtGuard } from './auth/manager-jwt.guard';
import { Manager } from './entities/manager.entity';
import { ManagerToken } from './entities/manager-token.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Manager,
      ManagerToken,
      Company,
      Employee,
      CompanySubscription,
      Plan
    ]),
    JwtModule.register({}),
  ],
  controllers: [ManagerController],
  providers: [
    ManagerService,
    ManagerJwtService,
    ManagerJwtGuard,
  ],
  exports: [ManagerService, ManagerJwtGuard],
})
export class ManagerModule {}