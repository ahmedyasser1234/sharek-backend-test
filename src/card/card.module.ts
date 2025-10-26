import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardService } from './card.service';
import { EmployeeCard } from '../employee/entities/employee-card.entity'; 
import { VisitModule } from '../visit/visit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeCard]),
    VisitModule,
  ],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}
