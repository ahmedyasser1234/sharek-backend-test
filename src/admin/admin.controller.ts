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
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';
import { Admin } from './entities/admin.entity';
import { Manager } from './entities/manager.entity';
import { AdminRequest } from './auth/interfaces/admin-request.interface';
import { 
  ManagerWithoutPassword, 
  DatabaseDownloadResponse, 
  CompanyWithActivator,
  SubscriptionResult,
} from './admin.service';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';

interface ExtendedAdminRequest extends Request {
  user?: { adminId: string; role: string };
}

interface AdminSimpleData {
  email: string;
}

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('refresh')
  @ApiOperation({ summary: 'تجديد توكن الأدمن مع البيانات' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.service.refresh(body.refreshToken);
  }

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الأدمن مع البيانات' })
  async login(@Body() body: { email: string; password: string }) {
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

  @Get('profile')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'الحصول على بريد الأدمن' })
  async getProfile(@Req() req: ExtendedAdminRequest): Promise<AdminSimpleData> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');

    const admin = await this.service.getAdminEmail(adminId);

    return {
      email: admin.email,
    };
  }

  @Post('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء بائع جديد' })
  createManager(@Request() req: AdminRequest, @Body() dto: { email: string; password: string }): Promise<ManagerWithoutPassword> {
    return this.service.createManager(req.user.adminId, dto);
  }

  @Get('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع البائعين' })
  getAllManagers(): Promise<ManagerWithoutPassword[]> {
    return this.service.getAllManagers();
  }

  @Put('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات البائع' })
  updateManager(@Param('id') id: string, @Body() dto: Partial<Manager>): Promise<ManagerWithoutPassword> {
    return this.service.updateManager(id, dto);
  }

  @Patch('managers/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل البائع' })
  activateManager(@Param('id') id: string): Promise<ManagerWithoutPassword> {
    return this.service.toggleManagerStatus(id, true);
  }

  @Patch('managers/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل البائع' })
  deactivateManager(@Param('id') id: string): Promise<ManagerWithoutPassword> {
    return this.service.toggleManagerStatus(id, false);
  }

  @Delete('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف البائع' })
  deleteManager(@Param('id') id: string): Promise<{ message: string }> {
    return this.service.deleteManager(id);
  }

  @Post('create-admin')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء أدمن جديد' })
  createAdmin(@Body() dto: { email: string; password: string }): Promise<Admin> {
    return this.service.createAdmin(dto);
  }

  @Put('update-admin/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الأدمن' })
  updateAdmin(@Param('id') id: string, @Body() dto: Partial<Admin>): Promise<Admin> {
    return this.service.updateAdmin(id, dto);
  }

  @Get('download-database')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحميل قاعدة البيانات (للأدمن فقط)' })
  downloadDatabase(): Promise<DatabaseDownloadResponse> {
    return this.service.downloadDatabase();
  }

  @Get('stats')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إحصائيات النظام' })
  getStats(): Promise<{ companies: number; employees: number; activeSubscriptions: number }> {
    return this.service.getStats();
  }

  @Get('companies')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات' })
  getCompanies(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    isVerified: boolean;
    subscriptionStatus: string;
    employeesCount: number;
  }>> {
    return this.service.getAllCompaniesWithEmployeeCount();
  }

  @Get('companies/with-activator')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات مع معلومات المفعّل' })
  getAllCompaniesWithActivator(): Promise<CompanyWithActivator[]> {
    return this.service.getAllCompaniesWithActivator();
  }

  @Patch('companies/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة' })
  activateCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة' })
  deactivateCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>): Promise<Company | null> {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شركة' })
  deleteCompany(@Param('id') id: string): Promise<void> {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض موظفي الشركة' })
  getEmployees(@Param('companyId') companyId: string): Promise<Employee[]> {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف موظف' })
  deleteEmployee(@Param('id') id: number): Promise<void> {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الاشتراكات' })
  getSubscriptions(): Promise<CompanySubscription[]> {
    return this.service.getAllSubscriptions();
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك' })
  activateSubscription(@Param('id') id: string): Promise<CompanySubscription | null> {
    return this.service.activateSubscription(id);
  }

  @Patch('subscriptions/:id/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة الاشتراك' })
  changePlan(@Param('id') id: string, @Body() body: { planId: string }): Promise<CompanySubscription | null> {
    return this.service.changeSubscriptionPlan(id, body.planId);
  }

  @Post('subscriptions/:companyId/subscribe/:planId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'اشتراك شركة في خطة جديدة بواسطة الأدمن' })
  async subscribeCompanyToPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ExtendedAdminRequest
  ): Promise<SubscriptionResult> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');

    return this.service.subscribeCompanyToPlan(companyId, planId, adminId);
  }
}