import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeCard } from './entities/employee-card.entity';
import { EmployeeImage } from './entities/EmployeeImage.entity';
import { Company } from '../company/entities/company.entity';
import { RevokedToken } from '../company/entities/revoked-token.entity'; // ✅ ضروري للحارس
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { CompanyModule } from '../company/company.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CardModule } from '../card/card.module';
import { VisitModule } from '../visit/visit.module'; 
import { CloudinaryModule } from '../common/services/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeCard,
      EmployeeImage,
      Company,       // ✅ علشان InjectRepository(Company)
      RevokedToken,  // ✅ علشان InjectRepository(RevokedToken) في الحارس
    ]),
    forwardRef(() => CompanyModule), // ✅ لو فيه تبادل بين Employee و Company
    SubscriptionModule,
    CardModule,
    VisitModule, 
    CloudinaryModule,
  ],
  controllers: [EmployeeController],
  providers: [
    EmployeeService,
    // ❌ لا تسجل CompanyJwtGuard هنا، لأنه مسجل في CompanyModule ويستخدم كـ Global
  ],
  exports: [EmployeeService],
})
export class EmployeeModule {}
