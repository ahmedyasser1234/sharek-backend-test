import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyJwtService } from './auth/company-jwt.service';
import { CompanyJwtGuard } from './auth/company-jwt.guard';
import { Employee } from '../employee/entities/employee.entity';
import { Company } from './entities/company.entity';
import { CompanyToken } from './auth/entities/company-token.entity';
import { CompanyLoginLog } from './auth/entities/company-login-log.entity';
import { RevokedToken } from './entities/revoked-token.entity';
import { CompanyActivity } from './entities/company-activity.entity';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard'; 
import { CloudinaryModule } from '../common/services/cloudinary.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ActivityTrackerService } from './service/activity-tracker.service';
import { CleanupService } from './service/cleanup.service';
import { FileUploadService } from '../common/services/file-upload.service'; 
import { ActivityInterceptor } from './interceptors/activity.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyToken,
      CompanyLoginLog,
      Employee,
      RevokedToken,
      CompanyActivity, 
    ]),
    forwardRef(() => SubscriptionModule), 
    CloudinaryModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'your-secret-key',
        signOptions: { 
          expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600'),
          issuer: 'sharik-app'
        },
      }),
    }),
  ],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    CompanyJwtService,
    CompanyJwtGuard,
    AdminJwtGuard,
    ActivityTrackerService, 
    CleanupService, 
    FileUploadService,
    ActivityInterceptor,
  ],
  exports: [
    CompanyService,
    CompanyJwtService,
    CompanyJwtGuard,
    ActivityTrackerService,
    TypeOrmModule,
  ],
})
export class CompanyModule {}