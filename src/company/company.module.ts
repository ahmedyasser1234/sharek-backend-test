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
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard'; 
import { CloudinaryModule } from '../common/services/cloudinary.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyToken,
      CompanyLoginLog,
      Employee,
      RevokedToken, 
    ]),
    forwardRef(() => SubscriptionModule),
    CloudinaryModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key', 
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    CompanyJwtService,
    CompanyJwtGuard,
    AdminJwtGuard,
  ],
  exports: [
    CompanyService,
    CompanyJwtService,
    CompanyJwtGuard,
    JwtModule, 
  ],
})
export class CompanyModule {}
