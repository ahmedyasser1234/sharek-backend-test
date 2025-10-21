import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { AdminModule } from './admin/admin.module';
import { CompanyModule } from './company/company.module';
import { EmployeeModule } from './employee/employee.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { VisitModule } from './visit/visit.module'; 
import { CardModule } from './card/card.module';
import { PlanModule } from './plan/plan.module';
import { PaymentModule } from './payment/payment.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CloudinaryService } from './common/services/cloudinary.service'
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    ScheduleModule.forRoot(), 
    AdminModule,
    CompanyModule,
    EmployeeModule,
    SubscriptionModule,
    VisitModule, 
    CardModule,
    PlanModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, CloudinaryService
  ],
  exports: [],
})
export class AppModule {}
