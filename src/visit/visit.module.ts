import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitService } from './visit.service';
import { Visit } from '../employee/entities/visit.entity';
import { VisitController } from './visit.controller';
import { CompanyModule } from '../company/company.module';
import { Employee } from '../employee/entities/employee.entity'; 

@Module({
  imports: [TypeOrmModule.forFeature([Visit , Employee]),
    CompanyModule],
  providers: [VisitService],
  controllers: [VisitController],
  exports: [VisitService], 
})
export class VisitModule {}
