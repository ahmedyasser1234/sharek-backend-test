import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardService } from './card.service';
import { EmployeeCard } from '../employee/entities/employee-card.entity'; 
import { VisitModule } from '../visit/visit.module';
import { DigitalCardService } from './digital-card.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeCard]),
    VisitModule,
  ],
  providers: [CardService , DigitalCardService],
  exports: [CardService , DigitalCardService],
})
export class CardModule {}
