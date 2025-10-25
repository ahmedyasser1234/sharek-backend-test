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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
  SetMetadata, 
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import { CompanyJwtGuard } from './auth/company-jwt.guard';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SubscriptionService } from '../subscription/subscription.service'; 
import { InternalServerErrorException } from '@nestjs/common';
import { Logger } from '@nestjs/common';

interface CompanyRequest extends Request {
  user?: { companyId: string; role: string };
}

const Public = () => SetMetadata('isPublic', true);

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);
  
  constructor(
    private readonly companyService: CompanyService,
    private readonly subscriptionService: SubscriptionService
  ) {}

  @Public()   
  @Post()
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(), 
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      cb(null, allowedTypes.includes(file.mimetype));
    },
  }))
  @ApiOperation({ summary: 'إنشاء شركة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الشركة بنجاح' })
  create(@Body() dto: CreateCompanyDto, @UploadedFile() logo: Express.Multer.File) {
    return this.companyService.createCompany(dto, logo);
  }

  //  تسجيل دخول 
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الشركة بالبريد الإلكتروني' })
  login(@Body() dto: LoginCompanyDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    return this.companyService.login(dto, ip);
  }

  //  تسجيل دخول OAuth 
  @Public()
  @Post('oauth-login')
  @ApiOperation({ summary: 'تسجيل دخول باستخدام Google/Facebook/LinkedIn' })
  oauthLogin(
    @Body('provider') provider: 'google' | 'facebook' | 'linkedin',
    @Body('token') token: string,
  ) {
    if (!provider || !token)
      throw new BadRequestException('مزود الخدمة والتوكن مطلوبين');
    return this.companyService.oauthLogin(provider, token);
  }

  //  إرسال كود تحقق 
  @Public()
  @Post('send-verification-code')
  @ApiOperation({ summary: 'إرسال كود تحقق إلى البريد الإلكتروني' })
  sendVerificationCode(@Body('email') email: string) {
    if (!email) throw new BadRequestException('الإيميل مطلوب');
    return this.companyService.sendVerificationCode(email);
  }

  //  تفعيل البريد الإلكتروني 
  @Public()
  @Post('verify-code')
  @ApiOperation({ summary: 'تفعيل البريد الإلكتروني عبر الكود' })
  verifyCode(@Body() body: { email: string; code: string }) {
    const { email, code } = body;
    if (!email || !code)
      throw new BadRequestException('الإيميل والكود مطلوبين');
    return this.companyService.verifyCode(email, code);
  }

  //  طلب إعادة تعيين كلمة المرور 
  @Public()
  @Post('request-password-reset')
  @ApiOperation({ summary: 'طلب كود إعادة تعيين كلمة المرور' })
  requestPasswordReset(@Body('email') email: string) {
    if (!email) throw new BadRequestException('الإيميل مطلوب');
    return this.companyService.requestPasswordReset(email);
  }

  //  تنفيذ إعادة تعيين كلمة المرور 
  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'تنفيذ إعادة تعيين كلمة المرور' })
  resetPassword(@Body() body: { email: string; code: string; newPassword: string }) {
    const { email, code, newPassword } = body;
    if (!email || !code || !newPassword)
      throw new BadRequestException('الإيميل والكود وكلمة المرور الجديدة مطلوبين');
    return this.companyService.resetPassword(email, code, newPassword);
  }

  //  تحديث التوكن 
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'تحديث التوكن' })
  refresh(@Req() req: Request) {
    const refreshToken = req.headers['x-refresh-token']?.toString();
    if (!refreshToken)
      throw new BadRequestException('Refresh token مطلوب في الهيدر');
    return this.companyService.refresh(refreshToken);
  }

  //  تسجيل خروج - محمي (يحتاج token)
  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'تسجيل خروج الشركة' })
  logout(@Req() req: Request) {
    const ip = req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress || req.ip || 'unknown';
    const refreshToken = req.headers['x-refresh-token']?.toString();
    const authHeader = req.headers['authorization'];
    const accessToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    if (!refreshToken)
      throw new BadRequestException('Refresh token مطلوب في الهيدر');

    return this.companyService.logout(refreshToken, ip, accessToken);
  }

  //  البروفايل - محمي
  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'جلب بيانات الشركة الحالية' })
  async getProfile(@Req() req: CompanyRequest) {
    if (!req.user?.companyId)
      throw new UnauthorizedException('Unauthorized access');

    try {
      const company = await this.companyService.getProfileById(req.user.companyId);
      if (!company) throw new BadRequestException('الشركة غير موجودة');

      const currentSub = await this.subscriptionService.getCompanySubscription(req.user.companyId);

      return { ...company, currentSubscription: currentSub };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تحميل بيانات الشركة: ${msg}`);
      throw new InternalServerErrorException('فشل تحميل بيانات الشركة');
    }
  }

  //  جلب جميع الشركات - محمي (للمشرف فقط)
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Get('all')
  @ApiOperation({ summary: 'جلب جميع الشركات (للمشرف فقط)' })
  findAll() {
    return this.companyService.findAll();
  }

  //  جلب شركة حسب ID - public (يمكن أن يكون public حسب متطلباتك)
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'جلب شركة حسب ID' })
  findOne(@Param('id') id: string) {
    return this.companyService.findById(id);
  }

  //  تحديث شركة - محمي
  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Put(':id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      cb(null, allowedTypes.includes(file.mimetype));
    },
  }))
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  @ApiResponse({ status: 200, description: 'تم تحديث بيانات الشركة بنجاح' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    return this.companyService.updateCompany(id, dto, logo);
  }

  //  حذف شركة - محمي (للمشرف فقط)
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'حذف شركة (للمشرف فقط)' })
  remove(@Param('id') id: string) {
    return this.companyService.deleteCompany(id);
  }
}