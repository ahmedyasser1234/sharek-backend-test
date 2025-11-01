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
  HttpStatus,
  Logger,
  InternalServerErrorException,
  NotFoundException,
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
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SubscriptionService } from '../subscription/subscription.service'; 

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
    limits: {
      fileSize: 5 * 1024 * 1024, 
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'إنشاء شركة جديدة' })
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
  async create(@Body() dto: CreateCompanyDto, @UploadedFile() logo?: Express.Multer.File) {
    const company = await this.companyService.createCompany(dto, logo);
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
            logoUrl: { type: 'string', example: 'https://example.com/logo.jpg' },
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
      this.logger.error(` فشل جلب الشعار للشركة ${id}: ${msg}`);
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
      this.logger.error(` فشل تحميل بيانات الشركة: ${msg}`);
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
  @Put(':id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      cb(null, allowedTypes.includes(file.mimetype));
    },
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
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
}