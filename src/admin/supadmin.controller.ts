/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
  Logger,
  BadRequestException,
  Req,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SupadminService } from './supadmin.service';
import { SupadminJwtGuard } from './auth/supadmin-jwt.guard';
import { TokenRefreshInterceptor } from '../common/interceptors/token-refresh.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SubscriptionStatus } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { ManagerRole } from './entities/manager.entity';
import { SupadminRole } from './entities/supadmin.entity';
import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

import type {
  SellerList,
  CompanyWithEmployeeCount,
  SubscriptionResult,
  PaymentProofList,
  ApproveRejectResult,
  SystemStats,
  SupadminWithData,
} from './supadmin.service';

interface CustomRequest extends Request {
  socket?: {
    remoteAddress?: string;
  };
  ip?: string;
  connection?: {
    remoteAddress?: string;
  };
}

interface SupadminRequest extends CustomRequest {
  supadmin?: any;
  supadminId?: string;
  supadminRole?: string;
  supadminPermissions?: Record<string, boolean>;
}

class LoginDto {
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  email: string;

  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @IsString()
  password: string;
}

class RefreshTokenDto {
  @IsNotEmpty({ message: 'توكن التجديد مطلوب' })
  @IsString()
  refreshToken: string;
}

class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class ChangePasswordDto {
  @IsNotEmpty({ message: 'كلمة المرور القديمة مطلوبة' })
  @IsString()
  oldPassword: string;

  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون على الأقل 6 أحرف' })
  newPassword: string;
}

class CreateSellerDto {
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  email: string;

  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون على الأقل 6 أحرف' })
  password: string;
}

class UpdateSellerDto {
  @IsOptional()
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون على الأقل 6 أحرف' })
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ToggleStatusDto {
  @IsNotEmpty({ message: 'الحالة مطلوبة' })
  @IsBoolean()
  isActive: boolean;
}

class RejectPaymentDto {
  @IsNotEmpty({ message: 'سبب الرفض مطلوب' })
  @IsString()
  @MinLength(10, { message: 'يرجى كتابة سبب مفصل للرفض (10 أحرف على الأقل)' })
  reason: string;
}

class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class SubscriptionFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('Supadmin - المسؤولين الأعلى')
@Controller('supadmin')
export class SupadminController {
  private readonly logger = new Logger(SupadminController.name);

  constructor(private readonly supadminService: SupadminService) {}

  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تسجيل دخول المسؤول الأعلى',
    description: 'يقوم بتسجيل دخول المسؤول الأعلى باستخدام البريد الإلكتروني وكلمة المرور'
  })
  async login(
    @Body() body: LoginDto,
    @Req() req: CustomRequest
  ) {
    try {
      this.logger.log(`=== Login Request Debug ===`);
      
      // التحقق النهائي من البيانات
      if (!body || !body.email || !body.password) {
        this.logger.error(`Login validation failed`);
        throw new BadRequestException('البريد الإلكتروني وكلمة المرور مطلوبان');
      }

      // استخراج IP - طريقة بسيطة بدون أخطاء TypeScript
      const getHeaderValue = (headerName: string): string | undefined => {
        const headers = req.headers as unknown as Record<string, string | string[] | undefined>;
        const value = headers[headerName.toLowerCase()] || headers[headerName];
        if (Array.isArray(value)) {
          return value.length > 0 ? value[0] : undefined;
        }
        return value;
      };
      
      const xForwardedFor = getHeaderValue('x-forwarded-for');
      const userAgent = getHeaderValue('user-agent');

      let ipAddress = '';
      if (xForwardedFor) {
        ipAddress = xForwardedFor.split(',')[0].trim();
      } else if (req.ip) {
        ipAddress = req.ip;
      } else if (req.socket?.remoteAddress) {
        ipAddress = req.socket.remoteAddress;
      }

      this.logger.log(`Attempting login for: ${body.email} from IP: ${ipAddress}`);
      
      const result = await this.supadminService.login(
        body.email,
        body.password,
        ipAddress,
        userAgent || ''
      );
      
      this.logger.log(`Login successful for: ${body.email}`);
      return result;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Login failed: ${errorMessage}`);
      throw error;
    }
  }

  @Post('refresh')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تجديد توكن الوصول',
    description: 'يقوم بتجديد توكن الوصول باستخدام توكن التجديد'
  })
  async refresh(@Body() body: RefreshTokenDto) {
    try {
      this.logger.log('محاولة تجديد توكن المسؤول الأعلى');
      const result = await this.supadminService.refresh(body.refreshToken);
      this.logger.log('تم تجديد التوكن بنجاح');
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل تجديد التوكن: ${errorMessage}`);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تسجيل خروج المسؤول الأعلى',
    description: 'يقوم بتسجيل خروج المسؤول الأعلى من الجهاز الحالي'
  })
  async logout(
    @Body() body: LogoutDto,
    @Req() req: SupadminRequest
  ) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException('مطلوب توكن التجديد');
    }

    const supadminId = req.supadminId;
    this.logger.log(`تسجيل خروج المسؤول الأعلى: ${supadminId}`);

    return this.supadminService.logout(refreshToken);
  }

  @Post('logout-all')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'تسجيل الخروج من جميع الأجهزة',
    description: 'يقوم بتسجيل خروج المسؤول الأعلى من جميع الأجهزة'
  })
  async logoutAll(@Req() req: SupadminRequest) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    this.logger.log(`تسجيل الخروج من جميع الأجهزة للمسؤول الأعلى: ${supadminId}`);
    return this.supadminService.logoutAll(supadminId);
  }

  @Get('profile')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'عرض الملف الشخصي',
    description: 'يعرض الملف الشخصي للمسؤول الأعلى الحالي'
  })
  async getProfile(@Req() req: SupadminRequest): Promise<SupadminWithData> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getProfile(supadminId);
  }

  @Put('profile')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true, skipMissingProperties: true }))
  @ApiOperation({ 
    summary: 'تحديث الملف الشخصي',
    description: 'يقوم بتحديث بيانات الملف الشخصي للمسؤول الأعلى'
  })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: SupadminRequest
  ): Promise<SupadminWithData> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.updateProfile(supadminId, dto);
  }

  @Patch('change-password')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تغيير كلمة المرور',
    description: 'يغير كلمة مرور المسؤول الأعلى الحالي'
  })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.changePassword(supadminId, dto.oldPassword, dto.newPassword);
  }

  // === إدارة البائعين ===
  @Get('sellers')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ 
    summary: 'عرض جميع البائعين',
    description: 'يعرض قائمة بجميع البائعين في النظام'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'رقم الصفحة' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'عدد العناصر في الصفحة' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'بحث في البريد الإلكتروني' })
  async getAllSellers(
    @Query() query: PaginationDto,
    @Req() req: SupadminRequest
  ): Promise<{ data: SellerList[]; total: number; page: number; totalPages: number }> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getAllSellers(
      supadminId,
      query.page || 1,
      query.limit || 10,
      query.search
    );
  }

  @Post('sellers')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'إنشاء بائع جديد',
    description: 'يقوم بإنشاء حساب بائع جديد في النظام'
  })
  async createSeller(
    @Body() dto: CreateSellerDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.createSeller(supadminId, dto);
  }

  @Put('sellers/:id')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true, skipMissingProperties: true }))
  @ApiOperation({ 
    summary: 'تحديث بيانات البائع',
    description: 'يقوم بتحديث بيانات البائع المحدد'
  })
  async updateSeller(
    @Param('id') id: string,
    @Body() dto: UpdateSellerDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.updateSeller(supadminId, id, dto);
  }

  @Patch('sellers/:id/status')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تغيير حالة البائع',
    description: 'يقوم بتفعيل أو تعطيل حساب البائع'
  })
  async toggleSellerStatus(
    @Param('id') id: string,
    @Body() body: ToggleStatusDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.toggleSellerStatus(supadminId, id, body.isActive);
  }

  @Delete('sellers/:id')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'حذف بائع',
    description: 'يقوم بحذف حساب البائع من النظام'
  })
  async deleteSeller(
    @Param('id') id: string,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.deleteSeller(supadminId, id);
  }

  // === إدارة الشركات ===
  @Get('companies')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ 
    summary: 'عرض جميع الشركات',
    description: 'يعرض قائمة بجميع الشركات في النظام'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'رقم الصفحة' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'عدد العناصر في الصفحة' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'بحث في اسم أو بريد الشركة' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'فلترة حسب حالة الشركة' })
  async getAllCompanies(
    @Query() query: PaginationDto,
    @Req() req: SupadminRequest
  ): Promise<{ data: CompanyWithEmployeeCount[]; total: number; page: number; totalPages: number }> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getAllCompanies(
      supadminId,
      query.page || 1,
      query.limit || 10,
      query.search,
      query.status
    );
  }

  @Patch('companies/:id/status')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تغيير حالة الشركة',
    description: 'يقوم بتفعيل أو تعطيل الشركة'
  })
  async toggleCompanyStatus(
    @Param('id') id: string,
    @Body() body: ToggleStatusDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.toggleCompanyStatus(supadminId, id, body.isActive);
  }

  @Delete('companies/:id')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'حذف شركة',
    description: 'يقوم بحذف الشركة وجميع بياناتها من النظام'
  })
  async deleteCompany(
    @Param('id') id: string,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.deleteCompany(supadminId, id);
  }

  // === إدارة الاشتراكات ===
  @Get('subscriptions')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ 
    summary: 'عرض جميع الاشتراكات',
    description: 'يعرض قائمة بجميع اشتراكات الشركات'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'رقم الصفحة' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'عدد العناصر في الصفحة' })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus, description: 'فلترة حسب حالة الاشتراك' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'بحث في اسم أو بريد الشركة' })
  async getAllSubscriptions(
    @Query() query: SubscriptionFilterDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getAllSubscriptions(
      supadminId,
      query.page || 1,
      query.limit || 10,
      query.status,
      query.search
    );
  }

  @Post('subscriptions/:companyId/subscribe/:planId')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'اشتراك شركة في خطة',
    description: 'يقوم باشتراك شركة في خطة محددة'
  })
  async subscribeCompanyToPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: SupadminRequest
  ): Promise<SubscriptionResult> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.subscribeCompanyToPlan(supadminId, companyId, planId);
  }

  @Patch('subscriptions/:companyId/cancel')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'إلغاء اشتراك شركة',
    description: 'يقوم بإلغاء اشتراك الشركة الحالي'
  })
  async cancelSubscription(
    @Param('companyId') companyId: string,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.cancelSubscription(supadminId, companyId);
  }

  @Patch('subscriptions/:companyId/extend')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'تمديد اشتراك شركة',
    description: 'يقوم بتمديد فترة اشتراك الشركة'
  })
  async extendSubscription(
    @Param('companyId') companyId: string,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.extendSubscription(supadminId, companyId);
  }

  @Patch('subscriptions/:companyId/change-plan/:newPlanId')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'تغيير خطة اشتراك الشركة',
    description: 'يقوم بتغيير خطة الاشتراك للشركة'
  })
  async changeSubscriptionPlan(
    @Param('companyId') companyId: string,
    @Param('newPlanId') newPlanId: string,
    @Req() req: SupadminRequest
  ): Promise<SubscriptionResult> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.changeSubscriptionPlan(supadminId, companyId, newPlanId);
  }

  // === إدارة الخطط ===
  @Get('plans')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ 
    summary: 'عرض جميع الخطط',
    description: 'يعرض قائمة بجميع الخطط المتاحة'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'رقم الصفحة' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'عدد العناصر في الصفحة' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'بحث في اسم الخطة' })
  async getAllPlans(
    @Query() query: PaginationDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getAllPlans(
      supadminId,
      query.page || 1,
      query.limit || 10,
      query.search
    );
  }

  @Post('plans')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'إنشاء خطة جديدة',
    description: 'يقوم بإنشاء خطة اشتراك جديدة'
  })
  async createPlan(
    @Body() planData: Partial<Plan>,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.createPlan(supadminId, planData);
  }

  @Put('plans/:id')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'تحديث خطة',
    description: 'يقوم بتحديث بيانات خطة موجودة'
  })
  async updatePlan(
    @Param('id') id: string,
    @Body() planData: Partial<Plan>,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.updatePlan(supadminId, id, planData);
  }

  @Patch('plans/:id/status')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'تغيير حالة الخطة',
    description: 'يقوم بتفعيل أو تعطيل الخطة'
  })
  async togglePlanStatus(
    @Param('id') id: string,
    @Body() body: ToggleStatusDto,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.togglePlanStatus(supadminId, id, body.isActive);
  }

  @Delete('plans/:id')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'حذف خطة',
    description: 'يقوم بحذف خطة من النظام'
  })
  async deletePlan(
    @Param('id') id: string,
    @Req() req: SupadminRequest
  ) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.deletePlan(supadminId, id);
  }

  // === إدارة المدفوعات ===
  @Get('payments/proofs')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ 
    summary: 'عرض طلبات التحويل البنكي',
    description: 'يعرض جميع طلبات إثبات الدفع البنكي'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'رقم الصفحة' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'عدد العناصر في الصفحة' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'فلترة حسب الحالة' })
  async getAllPaymentProofs(
    @Query() query: PaginationDto,
    @Req() req: SupadminRequest
  ): Promise<{ data: PaymentProofList[]; total: number; page: number; totalPages: number }> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getAllPaymentProofs(
      supadminId,
      query.page || 1,
      query.limit || 10,
      query.status
    );
  }

  @Patch('payments/proofs/:id/approve')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'قبول طلب تحويل بنكي',
    description: 'يقوم بالموافقة على طلب إثبات الدفع البنكي'
  })
  async approvePaymentProof(
    @Param('id') id: string,
    @Req() req: SupadminRequest
  ): Promise<ApproveRejectResult> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.approvePaymentProof(supadminId, id);
  }

  @Patch('payments/proofs/:id/reject')
  @UseGuards(SupadminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ 
    summary: 'رفض طلب تحويل بنكي',
    description: 'يقوم برفض طلب إثبات الدفع البنكي'
  })
  async rejectPaymentProof(
    @Param('id') id: string,
    @Body() body: RejectPaymentDto,
    @Req() req: SupadminRequest
  ): Promise<ApproveRejectResult> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.rejectPaymentProof(supadminId, id, body.reason);
  }

  @Get('stats')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'إحصائيات النظام',
    description: 'يعرض إحصائيات شاملة عن النظام'
  })
  async getSystemStats(@Req() req: SupadminRequest): Promise<SystemStats> {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.getSystemStats(supadminId);
  }

  @Post('database/export')
  @UseGuards(SupadminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'تصدير قاعدة البيانات',
    description: 'يقوم ببدء عملية تصدير قاعدة البيانات'
  })
  async exportDatabase(@Req() req: SupadminRequest) {
    const supadminId = req.supadminId;
    if (!supadminId) throw new UnauthorizedException('غير مصرح');

    return this.supadminService.exportDatabase(supadminId);
  }
}