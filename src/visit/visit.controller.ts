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
      return await this.visitService.logVisitById(body);
    } catch {
      throw new HttpException('فشل تسجيل الزيارة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get()
  async getAllVisits(@Req() req: AuthenticatedRequest) {
    try {
      const companyId = req.user.companyId;
      return await this.visitService.getAllForCompany(companyId);
    } catch {
      throw new HttpException('فشل جلب الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('count/:employeeId')
  async getCount(@Param('employeeId') id: number) {
    try {
      const count = await this.visitService.getVisitCount(id);
      return { employeeId: id, visits: count };
    } catch {
      throw new HttpException('فشل جلب عدد الزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('daily/:employeeId')
  async getDaily(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getDailyVisits(id);
    } catch {
      throw new HttpException('فشل جلب الزيارات اليومية', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('devices/:employeeId')
  async getDevices(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getDeviceStats(id);
    } catch {
      throw new HttpException('فشل جلب إحصائيات الأجهزة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('browsers/:employeeId')
  async getBrowsers(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getBrowserStats(id);
    } catch {
      throw new HttpException('فشل جلب إحصائيات المتصفحات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('os/:employeeId')
  async getOS(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getOSStats(id);
    } catch {
      throw new HttpException('فشل جلب إحصائيات أنظمة التشغيل', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('sources/:employeeId')
  async getSources(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getSourceStats(id);
    } catch {
      throw new HttpException('فشل جلب إحصائيات المصدر', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get('countries/:employeeId')
  async getCountries(@Param('employeeId') id: number) {
    try {
      return await this.visitService.getCountryStats(id);
    } catch {
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
      };
    } catch {
      throw new HttpException('فشل جلب بيانات الموظف والزيارات', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
