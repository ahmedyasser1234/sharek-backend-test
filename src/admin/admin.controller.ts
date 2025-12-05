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
  SetMetadata,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { SupervisorGuard } from './auth/supervisor.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';
import { Admin, AdminRole } from './entities/admin.entity';
import { Manager } from './entities/manager.entity';
import { AdminRequest } from './auth/interfaces/admin-request.interface';
import { 
  ManagerWithoutPassword, 
  DatabaseDownloadResponse, 
  CompanyWithActivator,
  SubscriptionResult,
  AdminBankInfo,
  AdminFullBankInfo,
} from './admin.service';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { AdminBankDto } from './dto/admin-bank.dto';

interface ExtendedAdminRequest extends Request {
  user?: { adminId: string; role: string };
}

interface AdminSimpleData {
  email: string;
}

interface CreateAdminDto {
  email: string;
  password: string;
  bankInfo?: AdminBankDto;
}

export const Permissions = (...permissions: string[]) => 
  SetMetadata('permissions', permissions);

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Put('bank-info')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث معلومات البنك للأدمن الحالي' })
  @ApiBody({ type: AdminBankDto })
  async updateBankInfo(
    @Req() req: ExtendedAdminRequest,
    @Body() dto: AdminBankDto
  ): Promise<{ message: string }> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    await this.service.updateBankInfo(adminId, dto);
    return { message: 'تم تحديث معلومات البنك بنجاح' };
  }

  @Put('bank-info/:adminId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث معلومات البنك لأي أدمن' })
  @ApiParam({ name: 'adminId', description: 'معرف الأدمن' })
  @ApiBody({ type: AdminBankDto })
  async updateBankInfoForAdmin(
    @Param('adminId') adminId: string,
    @Body() dto: AdminBankDto
  ): Promise<{ message: string }> {
    await this.service.updateBankInfo(adminId, dto);
    return { message: 'تم تحديث معلومات البنك بنجاح' };
  }

  @Get('bank-info/:adminId')
  @ApiOperation({ summary: 'عرض معلومات البنك لأي أدمن (بدون حماية)' })
  @ApiParam({ name: 'adminId', description: 'معرف الأدمن' })
  async getBankInfo(@Param('adminId') adminId: string): Promise<AdminBankInfo> {
    return this.service.getAdminBankInfo(adminId);
  }

  @Get('bank-info')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض معلومات البنك للأدمن الحالي' })
  async getMyBankInfo(
    @Req() req: ExtendedAdminRequest
  ): Promise<AdminBankInfo> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    return this.service.getAdminBankInfo(adminId);
  }

  @Get('all-bank-info')
  @ApiOperation({ summary: 'عرض معلومات البنك لجميع الأدمنز (بدون حماية)' })
  async getAllBankInfo(): Promise<AdminFullBankInfo[]> {
    return this.service.getAllAdminsBankInfo();
  }

  @Get('bank-info-public')
  @ApiOperation({ summary: 'عرض معلومات البنك للأدمنز النشطين فقط (بدون حماية)' })
  async getBankInfoPublic(): Promise<AdminFullBankInfo[]> {
    return this.service.getBankInfoPublic();
  }

  @Get('supervisor/managers')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('view_managers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض البائعين (للمشرفين فقط)' })
  getSupervisorManagers(@Req() req: ExtendedAdminRequest): Promise<ManagerWithoutPassword[]> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    return this.service.getSupervisorManagers(adminId);
  }

  @Post('supervisor/managers')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('create_managers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء بائع جديد (للمشرفين فقط)' })
  createSupervisorManager(
    @Req() req: ExtendedAdminRequest,
    @Body() dto: { email: string; password: string }
  ): Promise<ManagerWithoutPassword> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    return this.service.createManager(adminId, dto);
  }

  @Put('supervisor/managers/:id')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('edit_managers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات بائع (للمشرفين فقط)' })
  updateSupervisorManager(
    @Param('id') id: string,
    @Body() dto: Partial<Manager>
  ): Promise<ManagerWithoutPassword> {
    return this.service.updateManager(id, dto);
  }

  @Get('supervisor/companies')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('view_companies')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض الشركات (للمشرفين فقط)' })
  getSupervisorCompanies(@Req() req: ExtendedAdminRequest): Promise<CompanyWithActivator[]> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    return this.service.getSupervisorCompanies(adminId);
  }

  @Put('supervisor/companies/:id')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('edit_companies')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تعديل بيانات شركة (للمشرفين فقط)' })
  updateSupervisorCompany(
    @Param('id') id: string,
    @Body() dto: Partial<Company>
  ): Promise<Company | null> {
    return this.service.updateCompany(id, dto);
  }

  @Patch('supervisor/companies/:id/activate')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('edit_companies')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة (للمشرفين فقط)' })
  activateSupervisorCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, true);
  }

  @Patch('supervisor/companies/:id/deactivate')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('edit_companies')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة (للمشرفين فقط)' })
  deactivateSupervisorCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, false);
  }

  @Patch('supervisor/subscriptions/:id/activate')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('activate_subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك (للمشرفين فقط)' })
  activateSupervisorSubscription(@Param('id') id: string): Promise<CompanySubscription | null> {
    return this.service.activateSubscription(id);
  }

  @Get('supervisor/subscriptions')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('view_subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض الاشتراكات (للمشرفين فقط)' })
  getSupervisorSubscriptions(): Promise<CompanySubscription[]> {
    return this.service.getAllSubscriptions();
  }

  @Post('supervisor/subscriptions/:companyId/subscribe/:planId')
  @UseGuards(AdminJwtGuard, SupervisorGuard)
  @Permissions('activate_subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'اشتراك شركة في خطة (للمشرفين فقط)' })
  async subscribeSupervisorCompanyToPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ExtendedAdminRequest
  ): Promise<SubscriptionResult> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');

    return this.service.subscribeCompanyToPlan(companyId, planId, adminId);
  }

  @Get('admins/roles')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الأدمنز مع أدوارهم (للسوبر أدمن فقط)' })
  async getAllAdminsWithRoles(@Req() req: ExtendedAdminRequest): Promise<any> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    const admin = await this.service.getAdminById(adminId);
    if (admin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول');
    }
    
    return this.service.getAllAdminsWithRoles();
  }

  @Patch('admins/:id/role')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير دور الأدمن (للسوبر أدمن فقط)' })
  async updateAdminRole(
    @Param('id') id: string,
    @Body() body: { role: AdminRole },
    @Req() req: ExtendedAdminRequest
  ): Promise<Admin> {
    const currentAdminId = req.user?.adminId;
    if (!currentAdminId) throw new UnauthorizedException('غير مصرح');
    
    const currentAdmin = await this.service.getAdminById(currentAdminId);
    if (currentAdmin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('ليس لديك صلاحية تغيير الأدوار');
    }
    
    return this.service.updateAdminRole(id, body.role);
  }

  @Post('create-supervisor')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء مشرف جديد (للسوبر أدمن فقط)' })
  async createSupervisor(
    @Body() dto: { email: string; password: string },
    @Req() req: ExtendedAdminRequest
  ): Promise<Admin> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    const admin = await this.service.getAdminById(adminId);
    if (admin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('ليس لديك صلاحية إنشاء مشرفين');
    }
    
    return this.service.createAdmin({ 
      ...dto, 
      role: AdminRole.SUPERVISOR 
    });
  }

  @Get('my-role')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'الحصول على دور الأدمن الحالي' })
  async getMyRole(@Req() req: ExtendedAdminRequest): Promise<{ role: AdminRole }> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    
    const admin = await this.service.getAdminById(adminId);
    return { role: admin.role };
  }

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

  @Post('create-admin')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء أدمن جديد' })
  createAdmin(@Body() dto: CreateAdminDto): Promise<Admin> {
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
  getStats(): Promise<{ 
    companies: number; 
    employees: number; 
    activeSubscriptions: number;
    managers: number;
    admins: number;
  }> {
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