import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,           // ✅ الكيان الرئيسي
      CompanyToken,      // ✅ كيان التوكنات
      CompanyLoginLog,   // ✅ كيان اللوجات
      Employee,          // ✅ علشان نعد الموظفين بسهولة
    ]),
    JwtModule.register({
      secret: 'your-secret-key', // 🔐 مؤقتًا هنا، وهنتنقل لـ env لاحقًا
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    CompanyJwtService,
    CompanyJwtGuard,
  ],
  exports: [
    CompanyService,      // ✅ علشان تستخدمه موديولات تانية
    TypeOrmModule,       // ✅ علشان توفر الـ Repositories
    CompanyJwtService,   // ✅ لو هتستخدمه في موديولات تانية
  ],
})
export class CompanyModule {}
