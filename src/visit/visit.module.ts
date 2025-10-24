import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitService } from './visit.service';
import { Visit } from '../employee/entities/visit.entity';
import { VisitController } from './visit.controller';
import { CompanyModule } from '../company/company.module';
import { Employee } from '../employee/entities/employee.entity';
import { RevokedToken } from '../company/entities/revoked-token.entity'; // ✅ مطلوب للحارس لو بيستخدم هنا

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Visit,
      Employee,
      RevokedToken, // ✅ ضروري لو VisitService أو VisitController بيستخدموا CompanyJwtGuard
    ]),
    forwardRef(() => CompanyModule), // ✅ لو فيه تبادل بين Visit و Company
  ],
  providers: [VisitService],
  controllers: [VisitController],
  exports: [VisitService],
})
export class VisitModule {}
