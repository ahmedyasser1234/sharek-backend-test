import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';
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
    try {
      return await this.planService.findAll();
    } catch {
      throw new HttpException('فشل جلب الخطط', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'جلب تفاصيل خطة معينة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الخطة بنجاح' })
  async findOne(@Param('id') id: string): Promise<Plan> {
    try {
      return await this.planService.findOne(id);
    } catch {
      throw new HttpException(
        'فشل جلب تفاصيل الخطة',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء خطة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الخطة بنجاح' })
  async create(@Body() createPlanDto: CreatePlanDto): Promise<Plan> {
    try {
      return await this.planService.create(createPlanDto);
    } catch {
      throw new HttpException(
        'فشل إنشاء الخطة',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'تعديل خطة موجودة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم تعديل الخطة بنجاح' })
  async update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
  ): Promise<Plan> {
    try {
      return await this.planService.update(id, updatePlanDto);
    } catch {
      throw new HttpException(
        'فشل تعديل الخطة',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف خطة' })
  @ApiParam({ name: 'id', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم حذف الخطة بنجاح' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    try {
      return await this.planService.remove(id);
    } catch {
      throw new HttpException(
        'فشل حذف الخطة',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
