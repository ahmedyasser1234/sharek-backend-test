import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Admin } from './entities/admin.entity';
import { AdminToken } from './auth/entities/admin-token.entity'; 
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { JwtModule } from '@nestjs/jwt';
import { AdminJwtService } from './auth/admin-jwt.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      AdminToken, 
      Company,
      Employee,
      CompanySubscription,
      Plan,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: { expiresIn: '30m' },
    }),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminJwtService, 
    AdminJwtGuard,
    Reflector,
  ],
})
export class AdminModule {}
