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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
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

  // ==============================
  // تسجيل وإنشاء شركة
  // ==============================
  @Post()
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (req, file, cb) => {
          const ext = extname(file.originalname);
          cb(null, `logo-${Date.now()}${ext}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'إنشاء شركة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الشركة بنجاح' })
  create(
    @Body() dto: CreateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    this.logger.log(`✅ إنشاء شركة جديدة: ${dto.email}`);
    return this.companyService.createCompany(dto, logo);
  }

  // ==============================
  // تسجيل دخول بالبريد
  // ==============================
  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الشركة بالبريد' })
  login(@Body() dto: LoginCompanyDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    this.logger.log(`🔐 محاولة تسجيل دخول من IP: ${ip} للبريد: ${dto.email}`);
    return this.companyService.login(dto, ip);
  }

  // ==============================
  // تسجيل دخول باستخدام Google/Facebook/LinkedIn
  // ==============================
  @Post('oauth-login')
  @ApiOperation({ summary: 'تسجيل دخول الشركة باستخدام Google/Facebook/LinkedIn' })
  oauthLogin(
    @Body('provider') provider: 'google' | 'facebook' | 'linkedin',
    @Body('token') token: string,
  ) {
    if (!provider || !token) {
      throw new BadRequestException('مزود الخدمة والتوكن مطلوبين');
    }
    this.logger.log(`🌍 تسجيل دخول باستخدام ${provider}`);
    return this.companyService.oauthLogin(provider, token);
  }

  // ==============================
  // إعادة إرسال كود التحقق
  // ==============================
 @Post('send-verification-code')
@ApiOperation({ summary: 'إرسال كود تحقق إلى البريد الإلكتروني' })
async sendVerificationCode(@Body('email') email: string) {
  if (!email) throw new BadRequestException('الإيميل مطلوب');
  this.logger.log(`📧 إعادة إرسال كود تحقق للبريد: ${email}`);
  return this.companyService.sendVerificationCode(email); // ✅ فقط email
}

  // ==============================
  // تفعيل البريد بالكود
  // ==============================
  @Post('verify-code')
  @ApiOperation({ summary: 'تفعيل البريد الإلكتروني عبر الكود' })
  verifyCode(@Body() body: { email: string; code: string }) {
    if (!body.email || !body.code) {
      throw new BadRequestException('الإيميل والكود مطلوبين');
    }
    this.logger.log(`🔑 محاولة تفعيل البريد ${body.email} بالكود`);
    return this.companyService.verifyCode(body.email, body.code); // ✅ التغيير هنا
  }

  // ==============================
  // تحديث التوكن + تسجيل خروج
  // ==============================
  @Post('refresh')
  @ApiOperation({ summary: 'تحديث التوكن' })
  refresh(@Body('refreshToken') token: string) {
    if (!token) throw new BadRequestException('Refresh token مطلوب');
    this.logger.log(`🔄 تحديث توكن`);
    return this.companyService.refresh(token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'تسجيل خروج الشركة' })
  logout(@Body('refreshToken') token: string) {
    if (!token) throw new BadRequestException('Refresh token مطلوب');
    this.logger.log(`🚪 تسجيل خروج`);
    return this.companyService.logout(token);
  }

  // ==============================
  // بيانات الشركة الحالية
  // ==============================
  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'جلب بيانات الشركة الحالية' })
  async getProfile(@Req() req: CompanyRequest) {
    if (!req.user?.companyId) {
      throw new UnauthorizedException('Unauthorized access');
    }
    const companyId = req.user.companyId;
    const company = await this.companyService.findById(companyId);
    const currentSub = company.subscriptions?.sort(
      (a, b) => b.startDate.getTime() - a.startDate.getTime(),
    )[0];
    return { ...company, currentSubscription: currentSub };
  }

  // ==============================
  // جلب جميع الشركات
  // ==============================
  @Get('all')
  @ApiOperation({ summary: 'جلب جميع الشركات مع الاشتراكات' })
  getAllCompanies() {
    return this.companyService.findAll();
  }

  // ==============================
  // جلب شركة بالـ ID
  // ==============================
  @Get(':id')
  @ApiOperation({ summary: 'جلب شركة حسب ID' })
  findOne(@Param('id') id: string) {
    return this.companyService.findById(id);
  }

  // ==============================
  // تحديث شركة
  // ==============================
  @Put(':id')
  @UseInterceptors(
    FileInterceptor('logo', {
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
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    return this.companyService.updateCompany(id, dto, logo);
  }

  // ==============================
  // حذف شركة
  // ==============================
  @Delete(':id')
  @ApiOperation({ summary: 'حذف شركة' })
  remove(@Param('id') id: string) {
    return this.companyService.deleteCompany(id);
  }
}
