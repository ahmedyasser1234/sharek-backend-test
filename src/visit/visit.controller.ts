import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
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

  // ✅ تسجيل زيارة بدون حماية (يُستخدم من البطاقة العامة)
  @Post()
  logVisitFromPublic(@Body() body: {
    employeeId: number;
    source?: string;
    os?: string;
    browser?: string;
    deviceType?: string;
    ipAddress?: string;
  }) {
    return this.visitService.logVisitById(body);
  }

  // ✅ حماية باقي الدوال بالتوكن
  @UseGuards(CompanyJwtGuard)
  @Get()
  getAllVisits(@Req() req: AuthenticatedRequest) {
    const companyId = req.user.companyId;
    return this.visitService.getAllForCompany(companyId);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('count/:employeeId')
  getCount(@Param('employeeId') id: number) {
    return this.visitService.getVisitCount(id).then((count) => ({
      employeeId: id,
      visits: count,
    }));
  }

  @UseGuards(CompanyJwtGuard)
  @Get('daily/:employeeId')
  getDaily(@Param('employeeId') id: number) {
    return this.visitService.getDailyVisits(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('devices/:employeeId')
  getDevices(@Param('employeeId') id: number) {
    return this.visitService.getDeviceStats(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('employee/:employeeId')
  async getEmployeeWithVisits(@Param('employeeId') id: number) {
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
  }
}
