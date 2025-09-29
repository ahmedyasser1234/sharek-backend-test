import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Plans')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  @ApiOperation({ summary: 'جلب جميع الخطط المتاحة' })
  @ApiResponse({ status: 200, description: 'تم جلب الخطط بنجاح' })
  async findAll(): Promise<Plan[]> {
    return this.planService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'جلب تفاصيل خطة معينة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الخطة بنجاح' })
  async findOne(@Param('id') id: string): Promise<Plan> {
    return this.planService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء خطة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الخطة بنجاح' })
  async create(@Body() createPlanDto: CreatePlanDto): Promise<Plan> {
    return this.planService.create(createPlanDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'تعديل خطة موجودة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم تعديل الخطة بنجاح' })
  async update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
  ): Promise<Plan> {
    return this.planService.update(id, updatePlanDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف خطة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم حذف الخطة بنجاح' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.planService.remove(id);
  }
}
