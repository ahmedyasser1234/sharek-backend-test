import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Admin } from './entities/admin.entity';
import { Company } from '../company/entities/company.entity';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
  return this.service.refresh(body.refreshToken);
}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  logout(@Body() body: { refreshToken?: string }) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    return this.service.logout(refreshToken);
  }

  @Post('create-admin')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  createAdmin(@Body() dto: { email: string; password: string }) {
    return this.service.createAdmin(dto);
  }

  @Put('update-admin/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  updateAdmin(@Param('id') id: string, @Body() dto: Partial<Admin>) {
    return this.service.updateAdmin(id, dto);
  }

  @Get('stats')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  getStats() {
    return this.service.getStats();
  }

  @Get('companies')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  getCompanies() {
    return this.service.getAllCompaniesWithEmployeeCount();
  }

  @Patch('companies/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  activateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  deactivateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  deleteCompany(@Param('id') id: string) {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  getEmployees(@Param('companyId') companyId: string) {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  deleteEmployee(@Param('id') id: number) {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  getSubscriptions() {
    return this.service.getAllSubscriptions();
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  activateSubscription(@Param('id') id: string) {
    return this.service.activateSubscription(id);
  }

  @Patch('subscriptions/:id/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  changePlan(@Param('id') id: string, @Body() body: { planId: string }) {
    return this.service.changeSubscriptionPlan(id, body.planId);
  }
}
