import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';
import { JwtModule } from '@nestjs/jwt';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [
    PlanService,
    AdminJwtGuard,
  ],
  controllers: [PlanController],
  exports: [
    PlanService,
    TypeOrmModule,
  ],
})
export class PlanModule {}
