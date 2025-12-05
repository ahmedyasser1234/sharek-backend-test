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
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
  SetMetadata, 
  HttpStatus,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  Header,
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
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SubscriptionService } from '../subscription/subscription.service'; 
import { ActivityInterceptor } from './interceptors/activity.interceptor';

interface CompanyRequest extends Request {
  user?: { companyId: string; role: string };
}

const Public = () => SetMetadata('isPublic', true);

@ApiTags('Company')
@Controller('company')
@UseInterceptors(ActivityInterceptor) 
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);
  
  constructor(
    private readonly companyService: CompanyService,
    private readonly subscriptionService: SubscriptionService
  ) {}

  @Public()   
  @Post()
  @UseInterceptors(AnyFilesInterceptor({ 
    storage: memoryStorage(), 
    fileFilter: (req, file, cb) => {
      const allowedFields = ['logo', 'customFont'];
      
      if (!allowedFields.includes(file.fieldname)) {
        return cb(new BadRequestException(`حقل ملف غير متوقع: ${file.fieldname}. فقط 'logo' و 'customFont' مسموح بهما`), false);
      }
      
      if (file.fieldname === 'customFont') {
        const allowedFontTypes = [
          'font/ttf',
          'application/x-font-ttf',
          'application/x-font-truetype',
          'font/otf',
          'application/x-font-opentype',
          'font/opentype',
          'font/woff',
          'application/font-woff',
          'application/x-font-woff',
          'font/woff2',
          'application/font-woff2',
          'application/x-font-woff2',
          'application/vnd.ms-fontobject',
          'application/x-font-eot',
          'image/svg+xml',
          'font/svg',
          'application/octet-stream',
          'binary/octet-stream',
        ];
        
        const fileName = file.originalname || '';
        const parts = fileName.split('.');
        const fileExtension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
        
        const supportedExtensions = [
          'ttf', 'otf', 'woff', 'woff2', 'eot', 'svg',
          'ttc', 'dfont', 'fon', 'fnt'
        ];
        
        const isFontFile = allowedFontTypes.includes(file.mimetype) || 
                          supportedExtensions.includes(fileExtension);
        
        if (!isFontFile) {
          return cb(new BadRequestException(
            `نوع ملف الخط غير مدعوم. الصيغ المدعومة: TTF, OTF, WOFF, WOFF2, EOT, SVG, TTC, DFONT. نوع الملف المرسل: ${file.mimetype}`
          ), false);
        }
        return cb(null, true);
        
      } else if (file.fieldname === 'logo') {
        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!allowedImageTypes.includes(file.mimetype)) {
          return cb(new BadRequestException('نوع ملف الصورة غير مدعوم. يرجى استخدام JPEG أو PNG أو WebP أو SVG'), false);
        }
        return cb(null, true);
      }
      
      return cb(null, true);
    },
    limits: {
      fileSize: 15 * 1024 * 1024,
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'إنشاء شركة جديدة مع رفع ملف خط مخصص' })
  @ApiBody({
    description: 'بيانات الشركة مع إمكانية رفع ملف خط مخصص',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'اسم الشركة' },
        email: { type: 'string', example: 'company@example.com' },
        password: { type: 'string', example: 'password123' },
        phone: { type: 'string', example: '01012345678' },
        description: { type: 'string', example: 'وصف الشركة' },
        fontFamily: { type: 'string', example: 'MyCustomFont, sans-serif' },
        customFontName: { type: 'string', example: 'MyCustomFont' },
        customFontUrl: { 
          type: 'string', 
          example: 'https://example.com/font.woff2',
          description: 'رابط خارجي للخط (اختياري، استخدم customFont لرفع ملف بدلاً من الرابط)' 
        },
        logo: { 
          type: 'string', 
          format: 'binary', 
          description: 'ملف صورة الشعار (JPEG, PNG, WebP, SVG)' 
        },
        customFont: { 
          type: 'string', 
          format: 'binary', 
          description: 'ملف الخط المخصص (TTF, OTF, WOFF, WOFF2, EOT, SVG, TTC, DFONT)' 
        }
      },
      required: ['name', 'email', 'password']
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'تم إنشاء الشركة بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 201 },
        message: { type: 'string', example: 'تم إنشاء الشركة بنجاح، يرجى التحقق من البريد الإلكتروني' },
        data: { $ref: '#/components/schemas/Company' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'بيانات غير صالحة أو البريد مستخدم بالفعل' 
  })
  async create(
    @Body() dto: CreateCompanyDto, 
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    this.logger.debug(`ملفات مستلمة: ${files.length} ملفات`);
    
    const logo = files.find(file => file.fieldname === 'logo');
    const customFont = files.find(file => file.fieldname === 'customFont');
    
    if (customFont && dto.customFontUrl) {
      this.logger.warn('تم رفع ملف خط، سيتم تجاهل customFontUrl النصي');
    }
    
    const company = await this.companyService.createCompany(dto, logo, customFont);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'تم إنشاء الشركة بنجاح، يرجى التحقق من البريد الإلكتروني',
      data: company
    };
  }

  @Public()
  @Get(':id/logo')
  @ApiOperation({ summary: 'جلب رابط الشعار الخاص بالشركة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب رابط الشعار بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم جلب رابط الشعار بنجاح' },
        data: {
          type: 'object',
          properties: {
            logoUrl: { type: 'string', example: '/uploads/{companyId}/logo/logo_123456.webp' },
            companyId: { type: 'string', example: '12345' },
            companyName: { type: 'string', example: 'اسم الشركة' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'الشركة غير موجودة' 
  })
  async getCompanyLogo(@Param('id') id: string) {
    try {
      const result = await this.companyService.getCompanyLogo(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب رابط الشعار بنجاح',
        data: result
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الشعار للشركة ${id}: ${msg}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب الشعار');
    }
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الشركة بالبريد الإلكتروني' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تسجيل الدخول بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تسجيل الدخول بنجاح' },
        data: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            company: { $ref: '#/components/schemas/CompanyResponseDto' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'بيانات الدخول غير صحيحة' 
  })
  async login(@Body() dto: LoginCompanyDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const result = await this.companyService.login(dto, ip);
    return result; 
  }

  @Public()
  @Post('oauth-login')
  @ApiOperation({ summary: 'تسجيل دخول باستخدام Google/Facebook/LinkedIn' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تسجيل الدخول بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تسجيل الدخول بنجاح' },
        data: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            provider: { type: 'string' }
          }
        }
      }
    }
  })
  async oauthLogin(
    @Body('provider') provider: 'google' | 'facebook' | 'linkedin',
    @Body('token') token: string,
  ) {
    if (!provider || !token)
      throw new BadRequestException('مزود الخدمة والتوكن مطلوبين');
    const result = await this.companyService.oauthLogin(provider, token);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تسجيل الدخول بنجاح',
      data: result
    };
  }

  @Public()
  @Post('send-verification-code')
  @ApiOperation({ summary: 'إرسال كود تحقق إلى البريد الإلكتروني' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم إرسال كود التحقق بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم إرسال كود التحقق إلى email@example.com' }
      }
    }
  })
  async sendVerificationCode(@Body('email') email: string) {
    if (!email) throw new BadRequestException('الإيميل مطلوب');
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const result = await this.companyService.sendVerificationCode(email, code);
      return {
        statusCode: HttpStatus.OK,
        message: result
      };
    }

  @Public()
  @Post('verify-code')
  @ApiOperation({ summary: 'تفعيل البريد الإلكتروني عبر الكود' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تفعيل البريد الإلكتروني بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تفعيل البريد الإلكتروني بنجاح' }
      }
    }
  })
  async verifyCode(@Body() body: { email: string; code: string }) {
    const { email, code } = body;
    if (!email || !code)
      throw new BadRequestException('الإيميل والكود مطلوبين');
    const result = await this.companyService.verifyCode(email, code);
    return {
      statusCode: HttpStatus.OK,
      message: result
    };
  }

  @Public()
  @Post('request-password-reset')
  @ApiOperation({ summary: 'طلب كود إعادة تعيين كلمة المرور' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم إرسال كود إعادة التعيين بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم إرسال كود إعادة تعيين كلمة المرور' }
      }
    }
  })
  async requestPasswordReset(@Body('email') email: string) {
    if (!email) throw new BadRequestException('الإيميل مطلوب');
    const result = await this.companyService.requestPasswordReset(email);
    return {
      statusCode: HttpStatus.OK,
      message: result
    };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'تنفيذ إعادة تعيين كلمة المرور' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تغيير كلمة المرور بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تغيير كلمة المرور بنجاح' }
      }
    }
  })
  async resetPassword(@Body() body: { email: string; code: string; newPassword: string }) {
    const { email, code, newPassword } = body;
    if (!email || !code || !newPassword)
      throw new BadRequestException('الإيميل والكود وكلمة المرور الجديدة مطلوبين');
    const result = await this.companyService.resetPassword(email, code, newPassword);
    return {
      statusCode: HttpStatus.OK,
      message: result
    };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'تحديث التوكن' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تحديث التوكن بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تحديث التوكن بنجاح' },
        data: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' }
          }
        }
      }
    }
  })
  async refresh(@Req() req: Request) {
    const refreshToken = req.headers['x-refresh-token']?.toString();
    if (!refreshToken)
      throw new BadRequestException('Refresh token مطلوب في الهيدر');
    const result = await this.companyService.refresh(refreshToken);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديث التوكن بنجاح',
      data: result
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'تسجيل خروج الشركة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تسجيل الخروج بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تسجيل الخروج بنجاح' },
        data: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
          }
        }
      }
    }
  })
  async logout(@Req() req: Request) {
    const ip = req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress || req.ip || 'unknown';
    const refreshToken = req.headers['x-refresh-token']?.toString();
    const authHeader = req.headers['authorization'];
    const accessToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    if (!refreshToken)
      throw new BadRequestException('Refresh token مطلوب في الهيدر');

    const result = await this.companyService.logout(refreshToken, ip, accessToken);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تسجيل الخروج بنجاح',
      data: result
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Post('session/renew')
  @ApiOperation({ summary: 'تجديد الجلسة يدوياً' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تجديد الجلسة بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تجديد الجلسة بنجاح' },
        data: {
          type: 'object',
          properties: {
            renewedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  async renewSession(@Req() req: CompanyRequest) {
    if (!req.user?.companyId)
      throw new UnauthorizedException('Unauthorized access');

    await this.companyService.recordUserActivity(req.user.companyId, 'manual-session-renew');
    
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تجديد الجلسة بنجاح',
      data: {
        renewedAt: new Date()
      }
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'جلب بيانات الشركة الحالية' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب بيانات الشركة بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم جلب بيانات الشركة بنجاح' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            logoUrl: { type: 'string' },
            description: { type: 'string' },
            isActive: { type: 'boolean' },
            role: { type: 'string' },
            subscriptionStatus: { type: 'string' },
            subscribedAt: { type: 'string', format: 'date-time' },
            planId: { type: 'string' },
            paymentProvider: { type: 'string' },
            fontFamily: { type: 'string' },
            customFontUrl: { type: 'string', nullable: true },
            customFontName: { type: 'string', nullable: true },
            currentSubscription: { type: 'object' }
          }
        }
      }
    }
  })
  async getProfile(@Req() req: CompanyRequest) {
    if (!req.user?.companyId)
      throw new UnauthorizedException('Unauthorized access');

    try {
      const company = await this.companyService.getProfileById(req.user.companyId);
      if (!company) throw new BadRequestException('الشركة غير موجودة');

      const currentSub = await this.subscriptionService.getCompanySubscription(req.user.companyId);

      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب بيانات الشركة بنجاح',
        data: {
          ...company,
          currentSubscription: currentSub
        }
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحميل بيانات الشركة: ${msg}`);
      throw new InternalServerErrorException('فشل تحميل بيانات الشركة');
    }
  }

  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Get('all')
  @ApiOperation({ summary: 'جلب جميع الشركات (للمشرف فقط)' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب جميع الشركات بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم جلب جميع الشركات بنجاح' },
        data: { type: 'array', items: { $ref: '#/components/schemas/Company' } }
      }
    }
  })
  async findAll() {
    const companies = await this.companyService.findAll();
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب جميع الشركات بنجاح',
      data: companies
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'جلب شركة حسب ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب بيانات الشركة بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم جلب بيانات الشركة بنجاح' },
        data: { $ref: '#/components/schemas/Company' }
      }
    }
  })
  async findOne(@Param('id') id: string) {
    const company = await this.companyService.findById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب بيانات الشركة بنجاح',
      data: company
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Put('update-with-font')
  @UseInterceptors(AnyFilesInterceptor({ 
    storage: memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024, 
    },
    fileFilter: (req, file, cb) => {
      try {
        const typedFile = file as Express.Multer.File;
        
        const allowedFields = ['logo', 'customFont'];
        
        if (!allowedFields.includes(typedFile.fieldname)) {
          return cb(new BadRequestException(`حقل ملف غير متوقع: ${typedFile.fieldname}. فقط 'logo' و 'customFont' مسموح بهما`), false);
        }
        
        if (typedFile.fieldname === 'customFont') {
          const allowedFontTypes = [
            'font/ttf',
            'application/x-font-ttf',
            'application/x-font-truetype',
            'font/otf',
            'application/x-font-opentype',
            'font/opentype',
            'font/woff',
            'application/font-woff',
            'application/x-font-woff',
            'font/woff2',
            'application/font-woff2',
            'application/x-font-woff2',
            'application/vnd.ms-fontobject',
            'application/x-font-eot',
            'image/svg+xml',
            'font/svg',
            'application/octet-stream',
            'binary/octet-stream',
          ];
          
          const fileName = typedFile.originalname || '';
          const parts = fileName.split('.');
          const fileExtension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
          
          const supportedExtensions = [
            'ttf', 'otf', 'woff', 'woff2', 'eot', 'svg',
            'ttc', 'dfont', 
            'fon', 'fnt'
          ];
          
          const isFontFile = allowedFontTypes.includes(typedFile.mimetype) || 
                            supportedExtensions.includes(fileExtension);
          
          if (!isFontFile) {
            return cb(new BadRequestException(
              `نوع ملف الخط غير مدعوم. الصيغ المدعومة: TTF, OTF, WOFF, WOFF2, EOT, SVG, TTC, DFONT. نوع الملف المرسل: ${typedFile.mimetype}`
            ), false);
          }
          return cb(null, true);
          
        } else if (typedFile.fieldname === 'logo') {
          const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
          if (!allowedImageTypes.includes(typedFile.mimetype)) {
            return cb(new BadRequestException('نوع ملف الصورة غير مدعوم. يرجى استخدام JPEG أو PNG أو WebP أو SVG'), false);
          }
          return cb(null, true);
        }
        
        return cb(null, true);
      } catch (error: unknown) {
        let errorMessage = 'Unknown error occurred';
        
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          const errorObj = error as { message?: unknown };
          if (typeof errorObj.message === 'string') {
            errorMessage = errorObj.message;
          }
        }
        
        console.error(`خطأ في فحص الملف: ${errorMessage}`);
        return cb(new BadRequestException('خطأ في معالجة الملف'), false);
      }
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'تحديث بيانات الشركة مع الخط المخصص (يدعم جميع صيغ الخطوط)' })
  @ApiBody({
    description: 'بيانات الشركة والملفات - يدعم TTF, OTF, WOFF, WOFF2, EOT, SVG',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'اسم الشركة' },
        phone: { type: 'string', example: '01012345678' },
        description: { type: 'string', example: 'وصف الشركة' },
        fontFamily: { type: 'string', example: 'MyCustomFont, sans-serif' },
        customFontName: { type: 'string', example: 'MyCustomFont' },
        customFontUrl: { 
          type: 'string', 
          example: 'https://example.com/font.woff2',
          description: 'رابط خارجي للخط (اختياري، استخدم customFont لرفع ملف بدلاً من الرابط)' 
        },
        logo: { 
          type: 'string', 
          format: 'binary', 
          description: 'ملف صورة الشعار (JPEG, PNG, WebP, SVG)' 
        },
        customFont: { 
          type: 'string', 
          format: 'binary', 
          description: 'ملف الخط المخصص (TTF, OTF, WOFF, WOFF2, EOT, SVG, TTC, DFONT)' 
        }
      },
      required: []
    }
  })
  async updateWithFont(
    @Body() dto: UpdateCompanyDto,
    @UploadedFiles() files: Express.Multer.File[], 
    @Req() req: CompanyRequest
  ) {
    if (!req.user?.companyId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    const logo = files.find(file => file.fieldname === 'logo');
    const customFont = files.find(file => file.fieldname === 'customFont');

    this.logger.debug(`ملفات مستلمة: logo=${!!logo}, customFont=${!!customFont}`);
    this.logger.debug(`عدد الملفات الإجمالي: ${files.length}`);
    
    if (customFont) {
      this.logger.debug(`تفاصيل ملف الخط: 
        اسم الملف: ${customFont.originalname}
        نوع MIME: ${customFont.mimetype}
        الحجم: ${customFont.size} bytes
        الامتداد: ${customFont.originalname?.split('.').pop()?.toLowerCase()}
      `);
    }

    // إذا كان هناك ملف خط مرفوع، تجاهل customFontUrl إذا كان موجوداً
    if (customFont && dto.customFontUrl) {
      this.logger.warn('تم رفع ملف خط، سيتم تجاهل customFontUrl النصي');
      dto.customFontUrl = undefined;
    }

    await this.companyService.updateCompany(
      req.user.companyId, 
      dto, 
      logo, 
      customFont
    );
    
    return { 
      statusCode: HttpStatus.OK,
      message: 'تم تحديث بيانات الشركة والخط بنجاح' 
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Put('update-font')
  @UseInterceptors(FileInterceptor('customFont', {
    storage: memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedFontTypes = [
        'font/ttf',
        'application/x-font-ttf',
        'application/x-font-truetype',
        'font/otf',
        'application/x-font-opentype',
        'font/opentype',
        'font/woff',
        'application/font-woff',
        'application/x-font-woff',
        'font/woff2',
        'application/font-woff2',
        'application/x-font-woff2',
        'application/vnd.ms-fontobject',
        'application/x-font-eot',
        'image/svg+xml',
        'font/svg',
        'application/octet-stream',
        'binary/octet-stream',
      ];
      
      const fileName = file.originalname || '';
      const parts = fileName.split('.');
      const fileExtension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
      
      const supportedExtensions = [
        'ttf', 'otf', 'woff', 'woff2', 'eot', 'svg',
        'ttc', 'dfont', 'fon', 'fnt'
      ];
      
      const isFontFile = allowedFontTypes.includes(file.mimetype) || 
                        supportedExtensions.includes(fileExtension);
      
      if (!isFontFile) {
        return cb(new BadRequestException(
          `نوع ملف الخط غير مدعوم. الصيغ المدعومة: TTF, OTF, WOFF, WOFF2, EOT, SVG, TTC, DFONT. نوع الملف المرسل: ${file.mimetype}`
        ), false);
      }
      return cb(null, true);
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'بيانات الخط المخصص',
    schema: {
      type: 'object',
      properties: {
        customFontName: { type: 'string', example: 'MyCustomFont' },
        customFont: { 
          type: 'string', 
          format: 'binary',
          description: 'ملف الخط المخصص (TTF, OTF, WOFF, WOFF2, EOT, SVG)' 
        }
      }
    }
  })
  async updateFont(
    @Body() dto: { customFontName?: string },
    @UploadedFile() customFont?: Express.Multer.File,
    @Req() req?: CompanyRequest
  ) {
    if (!req?.user?.companyId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    await this.companyService.updateCompany(
      req.user.companyId,
      dto as UpdateCompanyDto,
      undefined,   
      customFont
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديث الخط بنجاح'
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Put(':id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
      cb(null, allowedTypes.includes(file.mimetype));
    },
    limits: {
      fileSize: 5 * 1024 * 1024, 
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تحديث بيانات الشركة بنجاح',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'تم تحديث بيانات الشركة بنجاح' }
      }
    }
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFile() logo: Express.Multer.File,
  ) {
    await this.companyService.updateCompany(id, dto, logo);
    return { message: 'تم تحديث بيانات الشركة بنجاح' };
  }

  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'حذف شركة (للمشرف فقط)' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم حذف الشركة بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم حذف الشركة بنجاح' }
      }
    }
  })
  async remove(@Param('id') id: string) {
    await this.companyService.deleteCompany(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم حذف الشركة بنجاح'
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Post('activity/ping')
  @ApiOperation({ summary: 'تسجيل نشاط المستخدم لإبقاء الجلسة نشطة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم تسجيل النشاط بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم تسجيل النشاط بنجاح' }
      }
    }
  })
  async recordActivity(@Req() req: CompanyRequest) {
    if (!req.user?.companyId)
      throw new UnauthorizedException('Unauthorized access');

    await this.companyService.recordUserActivity(req.user.companyId, 'ping');
    return {
      statusCode: HttpStatus.OK,
      message: 'تم تسجيل النشاط بنجاح'
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('session/check')
  @ApiOperation({ summary: 'التحقق من حالة الجلسة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'حالة الجلسة',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'الجلسة نشطة' },
        data: {
          type: 'object',
          properties: {
            isActive: { type: 'boolean', example: true },
            lastActivity: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  })
  async checkSession(@Req() req: CompanyRequest) {
    if (!req.user?.companyId)
      throw new UnauthorizedException('Unauthorized access');

    const isActive = !await this.companyService.shouldLogoutDueToInactivity(req.user.companyId);
    
    return {
      statusCode: HttpStatus.OK,
      message: isActive ? 'الجلسة نشطة' : 'انتهت الجلسة بسبب عدم النشاط',
      data: {
        isActive,
        lastActivity: new Date()
      }
    };
  }

  @Public()
  @Get(':companyId/font.css')
  @Header('Content-Type', 'text/css')
  @ApiOperation({ summary: 'جلب ملف CSS للخط المخصص للشركة' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب ملف CSS بنجاح',
    content: {
      'text/css': {
        schema: {
          type: 'string'
        }
      }
    }
  })
  async getCompanyFontCss(@Param('companyId') companyId: string) {
    try {
      const fontData = await this.companyService.getCompanyFont(companyId);
      return fontData.fontCss;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب CSS الخط للشركة ${companyId}: ${errorMessage}`);
      return `/* خطأ في تحميل الخط: ${errorMessage} */`;
    }
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Get('my-font/data')
  @ApiOperation({ summary: 'جلب بيانات الخط المخصص للشركة الحالية' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم جلب بيانات الخط بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم جلب بيانات الخط بنجاح' },
        data: {
          type: 'object',
          properties: {
            fontFamily: { type: 'string' },
            customFontUrl: { type: 'string', nullable: true },
            customFontName: { type: 'string', nullable: true },
            fontCss: { type: 'string' }
          }
        }
      }
    }
  })
  async getMyFont(@Req() req: CompanyRequest) {
    if (!req.user?.companyId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    const fontData = await this.companyService.getCompanyFont(req.user.companyId);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب بيانات الخط بنجاح',
      data: fontData
    };
  }

  @UseGuards(CompanyJwtGuard)
  @ApiBearerAuth()
  @Delete('custom-font')
  @ApiOperation({ summary: 'حذف الخط المخصص للشركة الحالية' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'تم حذف الخط المخصص بنجاح',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'تم حذف الخط المخصص بنجاح' }
      }
    }
  })
  async deleteCustomFont(@Req() req: CompanyRequest) {
    if (!req.user?.companyId) {
      throw new UnauthorizedException('Unauthorized access');
    }

    await this.companyService.deleteCustomFont(req.user.companyId);
    return {
      statusCode: HttpStatus.OK,
      message: 'تم حذف الخط المخصص بنجاح'
    };
  }
}

 