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
  Request,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';
import { Admin } from './entities/admin.entity';
import { Manager, ManagerRole } from './entities/manager.entity';
import { AdminRequest } from './auth/interfaces/admin-request.interface';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.service.refresh(body.refreshToken);
  }

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الأدمن' })
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل خروج الأدمن' })
  logout(@Body() body: { refreshToken?: string }) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    return this.service.logout(refreshToken);
  }

  @Post('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء مدير جديد' })
  createManager(@Request() req: AdminRequest, @Body() dto: { email: string; password: string; role?: ManagerRole }) {
    return this.service.createManager(req.user.adminId, dto);
  }

  @Get('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع المديرين' })
  getAllManagers() {
    return this.service.getAllManagers();
  }

  @Put('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات المدير' })
  updateManager(@Param('id') id: string, @Body() dto: Partial<Manager>) {
    return this.service.updateManager(id, dto);
  }

  @Patch('managers/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل المدير' })
  activateManager(@Param('id') id: string) {
    return this.service.toggleManagerStatus(id, true);
  }

  @Patch('managers/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل المدير' })
  deactivateManager(@Param('id') id: string) {
    return this.service.toggleManagerStatus(id, false);
  }

  @Delete('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف المدير' })
  deleteManager(@Param('id') id: string) {
    return this.service.deleteManager(id);
  }

  @Post('create-admin')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء أدمن جديد' })
  createAdmin(@Body() dto: { email: string; password: string }) {
    return this.service.createAdmin(dto);
  }

  @Put('update-admin/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الأدمن' })
  updateAdmin(@Param('id') id: string, @Body() dto: Partial<Admin>) {
    return this.service.updateAdmin(id, dto);
  }

  @Get('download-database')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحميل قاعدة البيانات (للأدمن فقط)' })
  downloadDatabase() {
    return this.service.downloadDatabase();
  }

  @Get('stats')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إحصائيات النظام' })
  getStats() {
    return this.service.getStats();
  }

  @Get('companies')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات' })
  getCompanies() {
    return this.service.getAllCompaniesWithEmployeeCount();
  }

  @Patch('companies/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة' })
  activateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة' })
  deactivateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شركة' })
  deleteCompany(@Param('id') id: string) {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض موظفي الشركة' })
  getEmployees(@Param('companyId') companyId: string) {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف موظف' })
  deleteEmployee(@Param('id') id: number) {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الاشتراكات' })
  getSubscriptions() {
    return this.service.getAllSubscriptions();
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك' })
  activateSubscription(@Param('id') id: string) {
    return this.service.activateSubscription(id);
  }

  @Patch('subscriptions/:id/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة الاشتراك' })
  changePlan(@Param('id') id: string, @Body() body: { planId: string }) {
    return this.service.changeSubscriptionPlan(id, body.planId);
  }
}