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

interface CompanyRequest extends Request {
  user: { companyId: string };
}

const IS_PUBLIC_KEY = 'isPublic';
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@ApiTags('Employee')
@Controller('employee')
export class EmployeeController {
  private readonly logger = new Logger(EmployeeController.name);

  constructor(private readonly employeeService: EmployeeService) {}

  @Public()
  @Get('by-url')
  @ApiOperation({ summary: 'جلب موظف باستخدام رابط البطاقة الفريد' })
  @ApiQuery({ name: 'url', description: 'الرابط الفريد للبطاقة', type: String })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiResponse({ status: 200, description: 'تم جلب بيانات البطاقة بنجاح' })
  async getByUniqueUrl(
    @Query('url') encodedUrl: string,
    @Query('source') source: string | undefined,
    @Req() req: Request
  ) {
    try {
      this.logger.debug(` getByUniqueUrl called with URL: ${encodedUrl}`);
      
      if (!encodedUrl) {
        throw new BadRequestException('URL parameter is required');
      }

      const uniqueUrl = decodeURIComponent(encodedUrl);
      const finalSource = source || 'link';

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
      throw new InternalServerErrorException('حدث خطأ أثناء جلب الموظف من الرابط');
    }
  }

  @Public()
  @Get(':id/google-wallet')
  @ApiOperation({ summary: 'رابط Google Wallet للبطاقة' })
  @ApiResponse({ status: 200, description: 'تم توليد رابط Google Wallet بنجاح' })
  async getGoogleWalletLink(@Param('id', ParseIntPipe) id: number) {
    return this.employeeService.generateGoogleWalletLink(id);
  }

  @Public()
  @Get(':id/apple-wallet')
  @ApiOperation({ summary: 'تحميل بطاقة Apple Wallet للموظف' })
  @ApiResponse({ status: 200, description: 'تم توليد بطاقة Apple Wallet بنجاح' })
  async getAppleWalletPass(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const passBuffer = await this.employeeService.generateAppleWalletPass(id);
      res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
      res.setHeader('Content-Disposition', 'attachment; filename=employee.pkpass');
      res.send(passBuffer);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إنشاء Apple Wallet pass: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء إنشاء Apple Wallet pass');
    }
  }

  @UseGuards(CompanyJwtGuard, SubscriptionGuard)
  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        cb(null, allowedTypes.includes(file.mimetype));
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
      throw new InternalServerErrorException('حدث خطأ أثناء جلب بيانات الموظف');
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Put(':id')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        cb(null, allowedTypes.includes(file.mimetype));
      },
    }),
  )
  @ApiOperation({ summary: 'تحديث بيانات موظف' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'تم تحديث بيانات الموظف بنجاح' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      const result = await this.employeeService.update(id, dto, files);
      return {
        statusCode: HttpStatus.OK,
        message: 'Employee updated successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحديث بيانات الموظف ${id}: ${msg}`);
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
        statusCode: 201,
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

private getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

}