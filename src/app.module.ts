import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core'; // ❌ علّق هذا
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
import { CloudinaryService } from './common/services/cloudinary.service';
import { CompanyJwtGuard } from './company/auth/company-jwt.guard';
import { CompanyJwtService } from './company/auth/company-jwt.service';
import { RevokedToken } from './company/entities/revoked-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([RevokedToken]),
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
    AppService,
    CloudinaryService,
    CompanyJwtService,
    CompanyJwtGuard, // ✅ أضف Guard كـ provider عادي
    
    // ❌ علّق الـ APP_GUARD مؤقتاً
    // {
    //   provide: APP_GUARD,
    //   useClass: CompanyJwtGuard,
    // },
  ],
})
export class AppModule {}