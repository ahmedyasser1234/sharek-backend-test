import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
  UnauthorizedException,
  Logger,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import { CompanyJwtGuard } from './auth/company-jwt.guard';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';

interface CompanyRequest extends Request {
  user?: { companyId: string; role: string };
}

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);

  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: './uploads/temp',
      filename: (req, file, cb) => {
        const ext = extname(file.originalname);
        cb(null, `logo-${Date.now()}${ext}`);
      },
    }),
  }))
  @ApiOperation({ summary: 'إنشاء شركة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الشركة بنجاح' })
  create(
    @Body() dto: CreateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    this.logger.log(`✅ إنشاء شركة جديدة: ${dto.email}`);
    return this.companyService.createCompany(dto, logo);
  }

  @Get()
  @ApiOperation({ summary: 'اختبار نقطة الوصول العامة للشركة' })
  @ApiResponse({ status: 200, description: 'النقطة تعمل بنجاح' })
  getRoot() {
    this.logger.log('📡 تم الوصول لـ /company بنجاح');
    return {
      success: true,
      message: 'Company endpoint is working',
      data: null,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الشركة' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الدخول بنجاح' })
  login(@Body() dto: LoginCompanyDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    this.logger.log(`🔐 محاولة تسجيل دخول من IP: ${ip} للبريد: ${dto.email}`);
    return this.companyService.login(dto, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'تحديث التوكن' })
  @ApiResponse({ status: 200, description: 'تم تحديث التوكن بنجاح' })
  refresh(@Body('refreshToken') token: string) {
    this.logger.log(`🔄 تحديث توكن: ${token}`);
    return this.companyService.refresh(token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'تسجيل خروج الشركة' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الخروج بنجاح' })
  logout(@Body('refreshToken') token: string) {
    this.logger.log(`🚪 تسجيل خروج باستخدام توكن: ${token}`);
    return this.companyService.logout(token);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'تفعيل البريد الإلكتروني' })
  @ApiResponse({ status: 200, description: 'تم التفعيل بنجاح' })
  verifyEmail(@Query('token') token: string) {
    this.logger.log(`📧 محاولة تفعيل البريد باستخدام توكن: ${token}`);
    return this.companyService.verifyEmail(token);
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'جلب بيانات الشركة الحالية' })
  @ApiResponse({ status: 200, description: 'تم جلب البيانات بنجاح' })
  async getProfile(@Req() req: CompanyRequest) {
    if (!req.user?.companyId) {
      this.logger.warn('🚫 req.user غير موجود أو companyId ناقص');
      throw new UnauthorizedException('Unauthorized access');
    }

    const companyId = req.user.companyId;
    this.logger.debug(`🔐 جلب بيانات الشركة من التوكن: ${companyId}`);

    const company = await this.companyService.findById(companyId);
    const currentSub = company.subscriptions?.sort(
      (a, b) => b.startDate.getTime() - a.startDate.getTime(),
    )[0];

    this.logger.log(`📦 تم جلب بيانات الشركة واشتراكها الحالي`);
    return { ...company, currentSubscription: currentSub };
  }

  @Get('all')
  @ApiOperation({ summary: 'جلب جميع الشركات مع الاشتراكات' })
  @ApiResponse({ status: 200, description: 'تم جلب الشركات بنجاح' })
  getAllCompanies() {
    this.logger.log('📦 جلب جميع الشركات من قاعدة البيانات');
    return this.companyService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'جلب شركة حسب ID' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب الشركة بنجاح' })
  findOne(@Param('id') id: string) {
    this.logger.debug(`🔍 جلب شركة بالمعرف: ${id}`);
    return this.companyService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'تحديث بيانات شركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم التحديث بنجاح' })
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const companyId = req.params.id;
        const folder = `./uploads/companies/${companyId}`;
        mkdirSync(folder, { recursive: true });
        cb(null, folder);
      },
      filename: (req, file, cb) => {
        const ext = extname(file.originalname);
        cb(null, `logo-${Date.now()}${ext}`);
      },
    }),
  }))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    this.logger.log(`✏️ تحديث بيانات الشركة: ${id}`);
    return this.companyService.updateCompany(id, dto, logo);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف شركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم الحذف بنجاح' })
  remove(@Param('id') id: string) {
    this.logger.warn(`🗑 حذف شركة بالمعرف: ${id}`);
    return this.companyService.deleteCompany(id);
  }
}
