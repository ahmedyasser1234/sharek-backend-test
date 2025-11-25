import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { VisitService } from './visit.service';
import { CompanyJwtGuard } from '../company/auth/company-jwt.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    companyId: string;
    role: string;
  };
}

@Controller('visits')
export class VisitController {
  private readonly logger = new Logger(VisitController.name);

  constructor(private readonly visitService: VisitService) {}

  @Post()
  async logVisitFromPublic(@Body() body: {
    employeeId: number;
    source?: string;
    os?: string;
    browser?: string;
    deviceType?: string;
    ipAddress?: string;
  }) {
    try {
      await this.visitService.logVisitById(body);
      return {
        statusCode: HttpStatus.CREATED,
        message: 'تم تسجيل الزيارة بنجاح',
      };
    } catch (error) {
      const errMsg =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : 'Unknown error';
      this.logger.error(`فشل تسجيل الزيارة: ${errMsg}`);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم معالجة الطلب',
      };
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get()
  async getAllVisits(@Req() req: AuthenticatedRequest) {
    try {
      const visits = await this.visitService.getAllForCompany(req.user.companyId);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب الزيارات بنجاح',
        data: visits,
      };
    } catch (error) {
      this.logger.error(`فشل جلب الزيارات: ${error}`);
      throw new HttpException('فشل جلب الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('count/:employeeId')
  async getCount(@Param('employeeId') id: number) {
    try {
      const visits = await this.visitService.getVisitCount(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب عدد الزيارات بنجاح',
        data: { 
          employeeId: id, 
          visits 
        },
      };
    } catch (error) {
      this.logger.error(`فشل جلب عدد الزيارات: ${error}`);
      throw new HttpException('فشل جلب عدد الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('daily/:employeeId')
  async getDaily(@Param('employeeId') id: number) {
    try {
      const dailyVisits = await this.visitService.getDailyVisits(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب الزيارات اليومية بنجاح',
        data: dailyVisits,
      };
    } catch (error) {
      this.logger.error(`فشل جلب الزيارات اليومية: ${error}`);
      throw new HttpException('فشل جلب الزيارات اليومية', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('devices/:employeeId')
  async getDevices(@Param('employeeId') id: number) {
    try {
      const deviceStats = await this.visitService.getDeviceStats(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات الأجهزة بنجاح',
        data: deviceStats,
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات الأجهزة: ${error}`);
      throw new HttpException('فشل جلب إحصائيات الأجهزة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('browsers/:employeeId')
  async getBrowsers(@Param('employeeId') id: number) {
    try {
      const browserStats = await this.visitService.getBrowserStats(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات المتصفحات بنجاح',
        data: browserStats,
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات المتصفحات: ${error}`);
      throw new HttpException('فشل جلب إحصائيات المتصفحات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('os/:employeeId')
  async getOS(@Param('employeeId') id: number) {
    try {
      const osStats = await this.visitService.getOSStats(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات أنظمة التشغيل بنجاح',
        data: osStats,
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات أنظمة التشغيل: ${error}`);
      throw new HttpException('فشل جلب إحصائيات أنظمة التشغيل', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('sources/:employeeId')
  async getSources(@Param('employeeId') id: number) {
    try {
      const sourceStats = await this.visitService.getSourceStats(id);
      
      const detailedSourceStats = await this.visitService.getDetailedSourceStats(id);
      
      const qrVsLinkStats = await this.visitService.getQRvsLinkStats(id);
      
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات المصادر بنجاح',
        data: {
          summary: sourceStats,
          detailed: detailedSourceStats,
          qrVsLink: qrVsLinkStats,
        },
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات المصادر: ${error}`);
      throw new HttpException('فشل جلب إحصائيات المصادر', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('countries/:employeeId')
  async getCountries(@Param('employeeId') id: number) {
    try {
      const countryStats = await this.visitService.getCountryStats(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات الدول بنجاح',
        data: countryStats,
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات الدول: ${error}`);
      throw new HttpException('فشل جلب إحصائيات الدول', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('employee/:employeeId')
  async getEmployeeWithVisits(@Param('employeeId') id: number) {
    try {
      const employee = await this.visitService.getEmployeeById(id);
      const visits = await this.visitService.getVisitCount(id);

      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب بيانات الموظف والزيارات بنجاح',
        data: {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          jobTitle: employee.jobTitle,
          phone: employee.phone,
          whatsapp: employee.whatsapp,
          location: employee.location,
          cardUrl: employee.cardUrl,
          qrCode: employee.qrCode || null,
          profileImageUrl: employee.profileImageUrl || null,
          secondaryImageUrl: employee.secondaryImageUrl || null,
          facebookImageUrl: employee.facebookImageUrl || null,
          instagramImageUrl: employee.instagramImageUrl || null,
          tiktokImageUrl: employee.tiktokImageUrl || null,
          snapchatImageUrl: employee.snapchatImageUrl || null,
          visits,
        },
      };
    } catch (error) {
      this.logger.error(`فشل جلب بيانات الموظف: ${error}`);
      throw new HttpException('فشل جلب بيانات الموظف', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('overview/:employeeId')
  async getVisitOverview(@Param('employeeId') id: number) {
    try {
      const [
        totalVisits,
        dailyVisits,
        deviceStats,
        browserStats,
        osStats,
        sourceStats,
        countryStats,
        qrVsLinkStats,
      ] = await Promise.all([
        this.visitService.getVisitCount(id),
        this.visitService.getDailyVisits(id),
        this.visitService.getDeviceStats(id),
        this.visitService.getBrowserStats(id),
        this.visitService.getOSStats(id),
        this.visitService.getSourceStats(id),
        this.visitService.getCountryStats(id),
        this.visitService.getQRvsLinkStats(id),
      ]);

      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب نظرة عامة عن الزيارات بنجاح',
        data: {
          totalVisits,
          dailyVisits,
          deviceStats,
          browserStats,
          osStats,
          sourceStats,
          countryStats,
          qrVsLinkStats,
        },
      };
    } catch (error) {
      this.logger.error(`فشل جلب النظرة العامة: ${error}`);
      throw new HttpException('فشل جلب النظرة العامة عن الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('qr-vs-link/:employeeId')
  async getQRvsLink(@Param('employeeId') id: number) {
    try {
      const qrVsLinkStats = await this.visitService.getQRvsLinkStats(id);
      return {
        statusCode: HttpStatus.OK,
        message: 'تم جلب إحصائيات QR مقابل الرابط بنجاح',
        data: qrVsLinkStats,
      };
    } catch (error) {
      this.logger.error(`فشل جلب إحصائيات QR مقابل الرابط: ${error}`);
      throw new HttpException('فشل جلب إحصائيات QR مقابل الرابط', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}