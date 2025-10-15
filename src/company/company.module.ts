import { Module, forwardRef } from '@nestjs/common';
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
    JwtModule.register({
      secret: 'your-secret-key', 
      signOptions: { expiresIn: '1d' },
    }),
    forwardRef(() => SubscriptionModule), 
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
    TypeOrmModule,       
    CompanyJwtService,
  ],
})
export class CompanyModule {}
