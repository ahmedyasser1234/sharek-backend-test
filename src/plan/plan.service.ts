import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  async findAll(): Promise<Plan[]> {
    return this.planRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('❌ الخطة غير موجودة');
    return plan;
  }

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    const exists = await this.planRepo.findOne({ where: { name: createPlanDto.name } });
    if (exists) throw new BadRequestException('❌ اسم الخطة مستخدم بالفعل');

    const plan = this.planRepo.create(createPlanDto);
    return this.planRepo.save(plan);
  }

  async update(id: string, updatePlanDto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findOne(id);
    Object.assign(plan, updatePlanDto);
    return this.planRepo.save(plan);
  }

  async remove(id: string): Promise<{ message: string }> {
    const plan = await this.findOne(id);
    await this.planRepo.remove(plan);
    return { message: '✅ تم حذف الخطة بنجاح' };
  }
}
