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
      throw new HttpException('فشل تسجيل الزيارة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(CompanyJwtGuard)
  @Get()
  async getAllVisits(@Req() req: AuthenticatedRequest) {
    return this.visitService.getAllForCompany(req.user.companyId);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('count/:employeeId')
  async getCount(@Param('employeeId') id: number) {
    const visits = await this.visitService.getVisitCount(id);
    return { employeeId: id, visits };
  }

  @UseGuards(CompanyJwtGuard)
  @Get('daily/:employeeId')
  async getDaily(@Param('employeeId') id: number) {
    return this.visitService.getDailyVisits(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('devices/:employeeId')
  async getDevices(@Param('employeeId') id: number) {
    return this.visitService.getDeviceStats(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('browsers/:employeeId')
  async getBrowsers(@Param('employeeId') id: number) {
    return this.visitService.getBrowserStats(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('os/:employeeId')
  async getOS(@Param('employeeId') id: number) {
    return this.visitService.getOSStats(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('sources/:employeeId')
  async getSources(@Param('employeeId') id: number) {
    return this.visitService.getSourceStats(id);
  }

  @UseGuards(CompanyJwtGuard)
  @Get('countries/:employeeId')
  async getCountries(@Param('employeeId') id: number) {
    return this.visitService.getCountryStats(id);
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
