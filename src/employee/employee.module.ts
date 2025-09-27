import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeCard } from './entities/employee-card.entity';
import { EmployeeImage } from './entities/EmployeeImage.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { CompanyModule } from '../company/company.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CompanyJwtGuard } from '../company/auth/company-jwt.guard';
import { CardModule } from '../card/card.module';
import { VisitModule } from '../visit/visit.module'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, EmployeeCard, EmployeeImage]),
    CompanyModule,
    SubscriptionModule,
    CardModule,
    VisitModule, 
  ],
  controllers: [EmployeeController],
  providers: [
    EmployeeService,
    CompanyJwtGuard,
  ],
  exports: [EmployeeService],
})
export class EmployeeModule {}
