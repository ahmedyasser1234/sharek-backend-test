import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PlanService } from './plan.service';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  async findAll(): Promise<Plan[]> {
    return this.planService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Plan> {
    return this.planService.findOne(id);
  }

  @Post()
  async create(@Body() createPlanDto: CreatePlanDto): Promise<Plan> {
    return this.planService.create(createPlanDto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto): Promise<Plan> {
    return this.planService.update(id, updatePlanDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.planService.remove(id);
  }
}
