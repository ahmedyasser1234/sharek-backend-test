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
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CompanyJwtGuard } from '../company/auth/company-jwt.guard';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import type { Request, Response } from 'express';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
// import { mkdirSync, existsSync } from 'fs';
import { memoryStorage } from 'multer';

interface CompanyRequest extends Request {
  user: { companyId: string };
}
/*
// ============  Multer Storage Config ============
function companyStorage() {
  return diskStorage({
    destination: (req, file, cb) => {
      const companyId = (req as CompanyRequest).user?.companyId;
      const fallback = './uploads/companies/unknown';
      const dest = companyId ? `./uploads/companies/${companyId}` : fallback;
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });
}

const storage = companyStorage();
*/
// ===================================================

@ApiTags('Employee')
@ApiBearerAuth()
@UseGuards(CompanyJwtGuard)
@Controller('employee')
export class EmployeeController {
  private readonly logger = new Logger(EmployeeController.name);

  constructor(private readonly employeeService: EmployeeService) {}

  // إنشاء موظف جديد
  @UseGuards(SubscriptionGuard)
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

  // جلب كل الموظفين
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

  // جلب موظف واحد
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

  // تحديث موظف
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

  // حذف موظف
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

  // جلب موظف بالرابط الفريد
  @Get('by-url/:uniqueUrl')
  @ApiOperation({ summary: 'جلب موظف باستخدام رابط البطاقة الفريد' })
  @ApiParam({ name: 'uniqueUrl', type: String })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiResponse({ status: 200, description: 'تم جلب بيانات البطاقة بنجاح' })
  async getByUniqueUrl(@Param('uniqueUrl') uniqueUrl: string, @Req() req: Request) {
    try {
      const source = (req.query.source as string) || 'link';
      const result = await this.employeeService.findByUniqueUrl(uniqueUrl, source, req);
      if (!result.data) throw new BadRequestException('Employee not found');
      return {
        statusCode: HttpStatus.OK,
        message: 'Employee fetched by URL successfully',
        data: result.data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الموظف من الرابط ${uniqueUrl}: ${msg}`);
      throw new InternalServerErrorException('حدث خطأ أثناء جلب الموظف من الرابط');
    }
  }

  // تصدير Excel
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

@Post('import/excel')
@UseInterceptors(FileInterceptor('file', {
  storage: diskStorage({
    destination: './uploads/excel',
    filename: (req, file, cb) => {
      const ext = extname(file.originalname);
      cb(null, `import-${Date.now()}${ext}`);
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
    return {
      statusCode: 201,
      message: `تم استيراد ${result.count} موظف`,
      data: result.imported,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`فشل استيراد Excel: ${msg}`);
    throw new InternalServerErrorException('حدث خطأ أثناء استيراد ملف Excel');
  }
}

@Get(':id/google-wallet')
async getGoogleWalletLink(@Param('id', ParseIntPipe) id: number) {
  return this.employeeService.generateGoogleWalletLink(id);
}

@Get(':id/apple-wallet')
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

}