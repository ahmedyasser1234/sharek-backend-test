import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { ManagerService } from './manager.service';
import { AdminController } from './admin.controller';
import { ManagerController } from './manager.controller';
import { Admin } from './entities/admin.entity';
import { Manager } from './entities/manager.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { AdminToken } from './auth/entities/admin-token.entity';
import { ManagerToken } from './entities/manager-token.entity';
import { AdminJwtService } from './auth/admin-jwt.service';
import { ManagerJwtService } from './auth/manager-jwt.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { ManagerJwtGuard } from './auth/manager-jwt.guard';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      Manager,
      Company,
      Employee,
      CompanySubscription,
      Plan,
      AdminToken,
      ManagerToken,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: { expiresIn: '30m' },
    }),
  ],
  controllers: [AdminController, ManagerController],
  providers: [
    AdminService,
    ManagerService,
    AdminJwtService,
    ManagerJwtService,
    AdminJwtGuard,
    ManagerJwtGuard,
    Reflector,
  ],
  exports: [AdminService, ManagerService],
})
export class AdminModule {}