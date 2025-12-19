import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';  
import { JwtModule } from '@nestjs/jwt';
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
import { NotificationModule } from './notification/notification.module';
import { BackupModule } from './backup/backup.module';
import { SupadminModule } from './admin/supadmin.module';

import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([RevokedToken]),
    ScheduleModule.forRoot(), 
    
    JwtModule.registerAsync({
      global: true, 
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
        signOptions: {
          expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600'), 
          issuer: 'sharik-app',
        },
      }),
    }),
    
    AdminModule,
    CompanyModule,
    EmployeeModule,
    SubscriptionModule,
    VisitModule, 
    CardModule,
    PlanModule,
    PaymentModule,
    NotificationModule,
    BackupModule,
    SupadminModule, 
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CloudinaryService,
    CompanyJwtService,
    CompanyJwtGuard, 
  ],
})
 
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggerMiddleware)
      .forRoutes('*'); 
  }
}