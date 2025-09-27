import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardService } from './card.service';
import { EmployeeCard } from '../employee/entities/employee-card.entity'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeCard]),
  ],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}
