import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Admin } from './entities/admin.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { JwtModule } from '@nestjs/jwt';
import { AdminJwtGuard } from './admin-jwt.guard';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      Company,
      Employee,
      CompanySubscription,
      Plan,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminJwtGuard, Reflector],
})
export class AdminModule {}
