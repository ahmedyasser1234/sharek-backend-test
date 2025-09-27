import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  providers: [PlanService],
  controllers: [PlanController],
  exports: [PlanService , TypeOrmModule],
})
export class PlanModule {}
