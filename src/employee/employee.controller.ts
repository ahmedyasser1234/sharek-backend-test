import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Put,
  Delete,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
  HttpStatus,
  Query,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  Res,
  SetMetadata,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CompanyJwtGuard } from '../company/auth/company-jwt.guard';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import type { Request, Response } from 'express';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { VisitService } from '../visit/visit.service';
import { CardService } from '../card/card.service';
import { DigitalCardService } from '../card/digital-card.service'; 

interface CompanyRequest extends Request {
  user: { companyId: string };
}

const IS_PUBLIC_KEY = 'isPublic';
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@ApiTags('Employee')
@Controller('employee')
export class EmployeeController {
  private readonly logger = new Logger(EmployeeController.name);

  constructor(
    private readonly employeeService: EmployeeService,
    private readonly visitService: VisitService,
    private readonly cardService: CardService,
    private readonly digitalCardService: DigitalCardService,
  ) {}

  @Public()
  @Get('secondary-image/:uniqueUrl')
  @ApiOperation({ summary: 'جلب صورة التحميل للبطاقة' })
  @ApiResponse({ status: 200, description: 'تم جلب صورة التحميل بنجاح' })
  @ApiResponse({ status: 404, description: 'البطاقة أو صورة التحميل غير موجودة' })
  async getSecondaryImageUrl(@Param('uniqueUrl') uniqueUrl: string) {
    try {
      this.logger.debug(`getSecondaryImageUrl called with uniqueUrl: ${uniqueUrl}`);
      
      if (!uniqueUrl) {
        throw new BadRequestException('uniqueUrl parameter is required');
      }

      const result = await this.employeeService.getSecondaryImageUrl(uniqueUrl);
      
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب صورة التحميل بنجاح',
        data: {
          secondaryImageUrl: result.secondaryImageUrl
        }
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب صورة التحميل: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب صورة التحميل');
    }
  }

  @Public()
  @Get('by-url')
  async getByUniqueUrl(
    @Query('url') encodedUrl: string,
    @Query('source') source: string | undefined,
    @Req() req: Request
  ) {
    try {
      this.logger.debug(`getByUniqueUrl called with URL: ${encodedUrl}`);
      
      if (!encodedUrl) {
        throw new BadRequestException('URL parameter is required');
      }

      const uniqueUrl = decodeURIComponent(encodedUrl);
      
      let finalSource = 'link';
      if (source) {
        finalSource = source;
      } else if (req.query && req.query.source) {
        finalSource = req.query.source as string;
      }

      this.logger.log(`جلب بيانات الموظف من الرابط: ${uniqueUrl} بمصدر: ${finalSource}`);

      const result = await this.employeeService.findByUniqueUrl(uniqueUrl, finalSource, req);
      if (!result.data) throw new BadRequestException('Employee not found');

      return {
        statusCode: HttpStatus.OK,
        message: 'Employee fetched by URL successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الموظف من الرابط ${encodedUrl}: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب الموظف من الرابط');
    }
  }

  @Public()
  @Get('card/:uniqueUrl')
  async getCardByUniqueUrl(
    @Param('uniqueUrl') uniqueUrl: string,
    @Query('source') source: string | undefined,
    @Req() req: Request
  ) {
    try {
      this.logger.debug(`getCardByUniqueUrl called with uniqueUrl: ${uniqueUrl}`);
      
      if (!uniqueUrl) {
        throw new BadRequestException('uniqueUrl parameter is required');
      }

      let finalSource = 'link';
      if (source) {
        finalSource = source;
      } else if (req.query && req.query.source) {
        finalSource = req.query.source as string;
      }

      this.logger.log(`جلب بطاقة الموظف: ${uniqueUrl} بمصدر: ${finalSource}`);

      const result = await this.employeeService.findByUniqueUrl(uniqueUrl, finalSource, req);
      if (!result.data) throw new BadRequestException('Employee card not found');

      return {
        statusCode: HttpStatus.OK,
        message: 'Employee card fetched successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب بطاقة الموظف ${uniqueUrl}: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب بطاقة الموظف');
    }
  }

  @Public()
  @Get(':id/google-wallet')
  @ApiOperation({ summary: 'رابط Google Wallet للبطاقة' })
  @ApiResponse({ status: 200, description: 'تم توليد رابط Google Wallet بنجاح' })
  async getGoogleWalletLink(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.employeeService.generateGoogleWalletLink(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم توليد رابط Google Wallet بنجاح',
        data: result,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إنشاء رابط Google Wallet: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء إنشاء رابط Google Wallet');
    }
  }


  @Public()
  @Get(':id/google-wallet/redirect')
  @ApiOperation({ summary: 'صفحة إضافة بطاقة Google Wallet' })
  async redirectToGoogleWallet(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const employee = await this.employeeService.getEmployeeForWallet(id);
      const html = this.digitalCardService.generateWalletHTML(employee, 'google');
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحميل صفحة Google Wallet: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء تحميل الصفحة');
    }
  }

  @Public()
  @Get(':id/apple-wallet')
  @ApiOperation({ summary: 'تحميل بطاقة Apple Wallet للموظف' })
  @ApiResponse({ status: 200, description: 'تم توليد بطاقة Apple Wallet بنجاح' })
  async getAppleWalletPass(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const { buffer, fileName } = await this.employeeService.generateAppleWalletPass(id);
      
      res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إنشاء Apple Wallet pass: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء إنشاء Apple Wallet pass');
    }
  }

  @Public()
  @Get(':id/apple-wallet/redirect')
  @ApiOperation({ summary: 'صفحة إضافة بطاقة Apple Wallet' })
  async redirectToAppleWallet(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const employee = await this.employeeService.getEmployeeForWallet(id);
      const html = this.digitalCardService.generateWalletHTML(employee, 'apple');
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحميل صفحة Apple Wallet: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء تحميل الصفحة');
    }
  }

 @Public()
@Get(':id/wallet-options')
@ApiOperation({ summary: 'خيارات إضافة البطاقة إلى المحافظ الرقمية' })
async getWalletOptions(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
  try {
    const employee = await this.employeeService.getEmployeeForWallet(id);
    
    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>خيارات المحفظة الرقمية - ${employee.name}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .employee-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: right;
        }
        .employee-name {
            font-size: 1.2rem;
            font-weight: bold;
            color: #333;
        }
        .employee-title {
            color: #666;
            margin-top: 5px;
        }
        .wallet-button {
            display: block;
            width: 100%;
            padding: 15px;
            margin: 10px 0;
            border: none;
            border-radius: 5px;
            color: white;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            transition: background-color 0.3s;
        }
        .wallet-button:hover {
            opacity: 0.9;
        }
        .google { background: #4285f4; }
        .apple { background: #000; }
    </style>
</head>
<body>
    <div class="card">
        <h1>اختر المحفظة الرقمية</h1>
        
        <div class="employee-info">
            <div class="employee-name">${employee.name}</div>
            <div class="employee-title">${employee.jobTitle || 'موظف'} - ${employee.company || 'شركة'}</div>
        </div>
        
        <div class="buttons-container">
            <button onclick="location.href='/employee/${id}/google-wallet/redirect'" class="wallet-button google">
                🏷️ إضافة إلى Google Wallet
            </button>
            <button onclick="location.href='/employee/${id}/apple-wallet/redirect'" class="wallet-button apple">
                📱 إضافة إلى Apple Wallet
            </button>
        </div>
        
        <p style="margin-top: 20px; color: #666; font-size: 0.9rem;">
            اختر المحفظة المناسبة لإضافة بطاقة ${employee.name} الرقمية
        </p>
    </div>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`فشل تحميل صفحة الخيارات: ${msg}`);
    throw new InternalServerErrorException('حدث خطأ أثناء تحميل الصفحة');
  }
}

  @UseGuards(CompanyJwtGuard, SubscriptionGuard)
  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg', 
          'image/png', 
          'image/webp',
          'application/pdf' 
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`نوع الملف غير مدعوم: ${file.mimetype}`), false);
        }
      },
      limits: {
        fileSize: 3 * 1024 * 1024, 
      },
    }),
  )
  @ApiOperation({ summary: 'إنشاء موظف جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الموظف بنجاح' })
  async create(
    @Body() dto: CreateEmployeeDto,
    @Req() req: CompanyRequest,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      this.logger.log(`إنشاء موظف جديد للشركة: ${req.user.companyId}`);
      
      this.logger.log(`عدد الملفات المستلمة في الـ Controller: ${files?.length || 0}`);
      if (files && files.length > 0) {
        files.forEach((file, index) => {
          this.logger.log(`    ${index + 1}. ${file.fieldname} - ${file.originalname} - ${file.mimetype} - ${file.size} bytes`);
        });
      }
      
      const result = await this.employeeService.create(dto, req.user.companyId, files);
      this.logger.log(`تم إنشاء الموظف: ${result.data?.id}`);
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Employee created successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إنشاء الموظف: ${msg}`);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء إنشاء الموظف');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get()
  @ApiOperation({ summary: 'جلب قائمة الموظفين مع دعم البحث والتقسيم' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'تم جلب الموظفين بنجاح' })
  async findAll(
    @Req() req: CompanyRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const result = await this.employeeService.findAll(req.user.companyId, pageNum, limitNum, search);
      return {
        statusCode: HttpStatus.OK,
        message: 'Employees fetched successfully',
        data: result.data,
        meta: result.meta,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الموظفين: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء جلب الموظفين');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get(':id')
  @ApiOperation({ summary: 'جلب بيانات موظف حسب ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'تم جلب بيانات الموظف بنجاح' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.employeeService.findOne(id);
      if (!result.data) throw new BadRequestException('Employee not found');
      return {
        statusCode: HttpStatus.OK,
        message: 'Employee fetched successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب بيانات الموظف: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب بيانات الموظف');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Put(':id')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg', 
          'image/png', 
          'image/webp',
          'application/pdf' 
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`نوع الملف غير مدعوم: ${file.mimetype}`), false);
        }
      },
      limits: {
        fileSize: 3 * 1024 * 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'تحديث بيانات موظف' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'تم تحديث بيانات الموظف بنجاح' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: CompanyRequest, 
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      this.logger.log(`محاولة تحديث الموظف: ${id} للشركة: ${req.user.companyId}`);
      
      this.logger.log(`عدد الملفات المستلمة في الـ Controller: ${files?.length || 0}`);
      if (files && files.length > 0) {
        files.forEach((file, index) => {
          this.logger.log(`    ${index + 1}. ${file.fieldname} - ${file.originalname} - ${file.mimetype} - ${file.size} bytes`);
        });
      }
      
      const result = await this.employeeService.update(id, dto, req.user.companyId, files); 
      return {
        statusCode: HttpStatus.OK,
        message: 'Employee updated successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحديث بيانات الموظف ${id}: ${msg}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء تحديث بيانات الموظف');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف موظف' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'تم حذف الموظف بنجاح' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.employeeService.remove(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'Employee deleted successfully',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل حذف الموظف ${id}: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء حذف الموظف');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('export/excel')
  async exportToExcel(@Req() req: CompanyRequest, @Res() res: Response) {
    try {
      const buffer = await this.employeeService.exportToExcel(req.user.companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=employees.xlsx');
      res.send(buffer);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تصدير Excel: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء تصدير ملف Excel');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Post('import/excel')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/excel',
      filename: (req, file, cb) => {
        const ext = extname(file.originalname);
        const filename = `import-${Date.now()}${ext}`;
        cb(null, filename);
      },
    }),
  }))
  @ApiOperation({ summary: 'استيراد موظفين من ملف Excel' })
  @ApiResponse({ status: 201, description: 'تم استيراد الموظفين بنجاح' })
  async importFromExcel(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: CompanyRequest,
  ) {
    try {
      const result = await this.employeeService.importFromExcel(file.path, req.user.companyId);

      let message = `تم استيراد ${result.count} موظف`;
      if (result.limitReached) {
        const limitSkipped = result.skipped.filter(s => s.includes('subscription limit reached')).length;
        message += ` وتم رفض ${limitSkipped} موظف بسبب تجاوز الحد في الخطة`;
      }
      
      return {
        statusCode: HttpStatus.CREATED,
        message: message,
        data: {
          imported: result.imported,
          skipped: result.skipped,
          summary: {
            totalImported: result.count,
            totalSkipped: result.skipped.length,
            limitReached: result.limitReached,
            limitSkippedCount: result.skipped.filter(s => s.includes('subscription limit reached')).length,
            successRate: Math.round((result.count / (result.count + result.skipped.length)) * 100)
          }
        },
      };
    } catch (error: unknown) {
      console.error('Excel import error:', error);
      throw new InternalServerErrorException('حدث خطأ أثناء استيراد ملف Excel');
    } finally {
      try {
        if (file?.path) {
          const fs = await import('fs/promises');
          await fs.unlink(file.path);
        }
      } catch {
        // تنظيف صامت
      }
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get(':id/analytics')
  async getEmployeeAnalytics(@Param('id', ParseIntPipe) id: number) {
    try {
      const employee = await this.employeeService.findOne(id);
      if (!employee.data) throw new NotFoundException('Employee not found');

      const [
        totalVisits,
        dailyVisits,
        deviceStats,
        browserStats,
        osStats,
        sourceStats,
        countryStats,
      ] = await Promise.all([
        this.visitService.getVisitCount(id),
        this.visitService.getDailyVisits(id),
        this.visitService.getDeviceStats(id),
        this.visitService.getBrowserStats(id),
        this.visitService.getOSStats(id),
        this.visitService.getSourceStats(id),
        this.visitService.getCountryStats(id),
      ]);

      return {
        statusCode: HttpStatus.OK,
        message: 'Employee analytics fetched successfully',
        data: {
          employee: employee.data,
          analytics: {
            totalVisits,
            dailyVisits,
            deviceStats,
            browserStats,
            osStats,
            sourceStats,
            countryStats,
          }
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب إحصائيات الموظف ${id}: ${msg}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('حدث خطأ أثناء جلب إحصائيات الموظف');
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}