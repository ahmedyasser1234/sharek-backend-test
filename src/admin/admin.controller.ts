// admin.controller.ts
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
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';
import { Admin } from './entities/admin.entity';
import { Manager } from './entities/manager.entity';
import { AdminRequest } from './auth/interfaces/admin-request.interface';
import { 
  ManagerWithoutPassword, 
  DatabaseDownloadResponse, 
  CompanyWithActivator,
  SubscriptionResult,
  BankAccountResponse,
} from './admin.service';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/admin-bank.dto';

interface ExtendedAdminRequest extends Request {
  user?: { adminId: string; role: string };
}

interface AdminSimpleData {
  email: string;
}

@ApiTags('Admin')
@Controller('admin')
@UseInterceptors(ClassSerializerInterceptor)
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول الأدمن' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الدخول بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات الدخول غير صحيحة' })
  async login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'تجديد توكن الأدمن مع البيانات' })
  @ApiResponse({ status: 200, description: 'تم تجديد التوكن بنجاح' })
  @ApiResponse({ status: 401, description: 'توكن غير صالح' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.service.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل خروج الأدمن' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الخروج بنجاح' })
  logout(@Body() body: { refreshToken?: string }) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('يجب توفير توكن التحديث');
    return this.service.logout(refreshToken);
  }

  @Get('profile')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'الحصول على بريد الأدمن' })
  @ApiResponse({ status: 200, description: 'تم الحصول على البيانات بنجاح' })
  @ApiResponse({ status: 401, description: 'غير مصرح' })
  async getProfile(@Req() req: ExtendedAdminRequest): Promise<AdminSimpleData> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');

    const admin = await this.service.getAdminEmail(adminId);

    return {
      email: admin.email,
    };
  }

  @Get('companies/me')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'الحصول على الشركات المرتبطة بالأدمن' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الشركات بنجاح' })
  async getAdminCompanies(@Req() req: ExtendedAdminRequest): Promise<CompanyWithActivator[]> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');

    return this.service.getAdminCompanies(adminId);
  }

  @Post('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء بائع جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء البائع بنجاح' })
  @ApiResponse({ status: 400, description: 'البريد الإلكتروني مستخدم بالفعل' })
  @ApiResponse({ status: 404, description: 'الأدمن غير موجود' })
  createManager(
    @Request() req: AdminRequest, 
    @Body() dto: { email: string; password: string }
  ): Promise<ManagerWithoutPassword> {
    return this.service.createManager(req.user.adminId, dto);
  }

  @Get('managers')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع البائعين' })
  @ApiResponse({ status: 200, description: 'تم الحصول على البائعين بنجاح' })
  getAllManagers(): Promise<ManagerWithoutPassword[]> {
    return this.service.getAllManagers();
  }

  @Put('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات البائع' })
  @ApiResponse({ status: 200, description: 'تم تحديث البائع بنجاح' })
  @ApiResponse({ status: 400, description: 'البريد الإلكتروني مستخدم بالفعل' })
  @ApiResponse({ status: 404, description: 'البائع غير موجود' })
  updateManager(
    @Param('id') id: string, 
    @Body() dto: Partial<Manager>
  ): Promise<ManagerWithoutPassword> {
    return this.service.updateManager(id, dto);
  }

  @Patch('managers/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل البائع' })
  @ApiResponse({ status: 200, description: 'تم تفعيل البائع بنجاح' })
  @ApiResponse({ status: 404, description: 'البائع غير موجود' })
  activateManager(@Param('id') id: string): Promise<ManagerWithoutPassword> {
    return this.service.toggleManagerStatus(id, true);
  }

  @Patch('managers/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل البائع' })
  @ApiResponse({ status: 200, description: 'تم إلغاء تفعيل البائع بنجاح' })
  @ApiResponse({ status: 404, description: 'البائع غير موجود' })
  deactivateManager(@Param('id') id: string): Promise<ManagerWithoutPassword> {
    return this.service.toggleManagerStatus(id, false);
  }

  @Delete('managers/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف البائع' })
  @ApiResponse({ status: 200, description: 'تم حذف البائع بنجاح' })
  @ApiResponse({ status: 404, description: 'البائع غير موجود' })
  deleteManager(@Param('id') id: string): Promise<{ message: string }> {
    return this.service.deleteManager(id);
  }

  @Post('create-admin')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء أدمن جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الأدمن بنجاح' })
  @ApiResponse({ status: 400, description: 'البريد الإلكتروني مستخدم بالفعل' })
  createAdmin(@Body() dto: { email: string; password: string }): Promise<Admin> {
    return this.service.createAdmin(dto);
  }

  @Put('update-admin/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الأدمن' })
  @ApiResponse({ status: 200, description: 'تم تحديث الأدمن بنجاح' })
  @ApiResponse({ status: 404, description: 'الأدمن غير موجود' })
  updateAdmin(@Param('id') id: string, @Body() dto: Partial<Admin>): Promise<Admin> {
    return this.service.updateAdmin(id, dto);
  }

  @Post('bank-accounts')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إنشاء حساب بنكي جديد' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الحساب البنكي بنجاح' })
  @ApiResponse({ status: 400, description: 'رقم الحساب أو الآيبان موجود بالفعل' })
  async createBankAccount(
    @Body() dto: CreateBankAccountDto
  ): Promise<BankAccountResponse> {
    return this.service.createBankAccount(dto);
  }

  @Get('bank-accounts')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الحسابات البنكية (محمي)' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الحسابات بنجاح' })
  async getAllBankAccounts(): Promise<BankAccountResponse[]> {
    return this.service.getAllBankAccounts();
  }

  @Get('bank-accounts/public')
  @ApiOperation({ summary: 'عرض جميع الحسابات البنكية (عام)' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الحسابات بنجاح' })
  async getPublicBankAccounts(): Promise<BankAccountResponse[]> {
    return this.service.getPublicBankAccounts();
  }

  @Get('bank-accounts/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض تفاصيل حساب بنكي معين' })
  @ApiResponse({ status: 200, description: 'تم الحصول على تفاصيل الحساب بنجاح' })
  @ApiResponse({ status: 404, description: 'الحساب البنكي غير موجود' })
  async getBankAccountById(
    @Param('id') id: string
  ): Promise<BankAccountResponse> {
    return this.service.getBankAccountById(id);
  }

  @Put('bank-accounts/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات حساب بنكي' })
  @ApiResponse({ status: 200, description: 'تم تحديث الحساب البنكي بنجاح' })
  @ApiResponse({ status: 400, description: 'رقم الحساب أو الآيبان موجود بالفعل لحساب آخر' })
  @ApiResponse({ status: 404, description: 'الحساب البنكي غير موجود' })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto
  ): Promise<BankAccountResponse> {
    return this.service.updateBankAccount(id, dto);
  }

  @Delete('bank-accounts/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف حساب بنكي' })
  @ApiResponse({ status: 200, description: 'تم حذف الحساب البنكي بنجاح' })
  @ApiResponse({ status: 404, description: 'الحساب البنكي غير موجود' })
  async deleteBankAccount(
    @Param('id') id: string
  ): Promise<{ message: string }> {
    return this.service.deleteBankAccount(id);
  }

  @Get('download-database')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحميل قاعدة البيانات (للأدمن فقط)' })
  @ApiResponse({ status: 200, description: 'تم تحميل البيانات بنجاح' })
  downloadDatabase(): Promise<DatabaseDownloadResponse> {
    return this.service.downloadDatabase();
  }

  @Get('stats')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إحصائيات النظام' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الإحصائيات بنجاح' })
  getStats(): Promise<{ companies: number; employees: number; activeSubscriptions: number }> {
    return this.service.getStats();
  }

  @Get('companies')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الشركات بنجاح' })
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
  @ApiResponse({ status: 200, description: 'تم الحصول على الشركات بنجاح' })
  getAllCompaniesWithActivator(): Promise<CompanyWithActivator[]> {
    return this.service.getAllCompaniesWithActivator();
  }

  @Patch('companies/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة' })
  @ApiResponse({ status: 200, description: 'تم تفعيل الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة غير موجودة' })
  activateCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة' })
  @ApiResponse({ status: 200, description: 'تم إلغاء تفعيل الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة غير موجودة' })
  deactivateCompany(@Param('id') id: string): Promise<Company | null> {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  @ApiResponse({ status: 200, description: 'تم تحديث الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة غير موجودة' })
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>): Promise<Company | null> {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شركة' })
  @ApiResponse({ status: 200, description: 'تم حذف الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة غير موجودة' })
  @ApiResponse({ status: 500, description: 'فشل في حذف الشركة' })
  deleteCompany(@Param('id') id: string): Promise<void> {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض موظفي الشركة' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الموظفين بنجاح' })
  getEmployees(@Param('companyId') companyId: string): Promise<Employee[]> {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف موظف' })
  @ApiResponse({ status: 200, description: 'تم حذف الموظف بنجاح' })
  @ApiResponse({ status: 404, description: 'الموظف غير موجود' })
  deleteEmployee(@Param('id') id: number): Promise<void> {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الاشتراكات' })
  @ApiResponse({ status: 200, description: 'تم الحصول على الاشتراكات بنجاح' })
  getSubscriptions(): Promise<CompanySubscription[]> {
    return this.service.getAllSubscriptions();
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك' })
  @ApiResponse({ status: 200, description: 'تم تفعيل الاشتراك بنجاح' })
  @ApiResponse({ status: 404, description: 'الاشتراك غير موجود' })
  activateSubscription(@Param('id') id: string): Promise<CompanySubscription | null> {
    return this.service.activateSubscription(id);
  }

  @Patch('subscriptions/:id/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة الاشتراك (باستخدام subscriptionId)' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  @ApiResponse({ status: 404, description: 'الاشتراك أو الخطة غير موجودة' })
  changePlan(
    @Param('id') id: string, 
    @Body() body: { planId: string },
    @Req() req: ExtendedAdminRequest
  ): Promise<CompanySubscription | null> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    return this.service.changeSubscriptionPlan(id, body.planId, adminId);
  }

  // === ENDPOINT متوافق مع الـ UI القديم ===
  @Patch('subscriptions/company/:companyId/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة الشركة (متوافق مع UI القديم)' })
  @ApiResponse({ status: 200, description: 'تم تغيير خطة الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async changePlanForCompany(
    @Param('companyId') companyId: string, 
    @Body() body: { planId: string },
    @Req() req: ExtendedAdminRequest
  ): Promise<CompanySubscription> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    return this.service.changeCompanyPlan(companyId, body.planId, adminId);
  }

  @Patch('companies/:companyId/upgrade-plan/:planId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ترقية اشتراك شركة إلى خطة جديدة' })
  @ApiResponse({ status: 200, description: 'تم ترقية الاشتراك بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async upgradeCompanyPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ExtendedAdminRequest
  ): Promise<CompanySubscription> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    return this.service.upgradeCompanySubscription(companyId, planId, adminId);
  }

  // === ENDPOINTS الجديدة والأسهل ===
  
  @Patch('companies/:companyId/change-plan/:planId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة شركة (الأسهل - باستخدام URL params)' })
  @ApiResponse({ status: 200, description: 'تم تغيير خطة الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async changeCompanyPlanWithParams(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ExtendedAdminRequest
  ): Promise<CompanySubscription> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    return this.service.changeCompanyPlan(companyId, planId, adminId);
  }

  @Patch('companies/:companyId/change-plan')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة شركة (باستخدام Body)' })
  @ApiResponse({ status: 200, description: 'تم تغيير خطة الشركة بنجاح' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async changeCompanyPlanWithBody(
    @Param('companyId') companyId: string,
    @Body() body: { planId: string },
    @Req() req: ExtendedAdminRequest
  ): Promise<CompanySubscription> {
    const adminId = req.user?.adminId;
    if (!adminId) throw new UnauthorizedException('غير مصرح');
    return this.service.changeCompanyPlan(companyId, body.planId, adminId);
  }

  @Post('companies/:companyId/subscribe/:planId')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'اشتراك شركة في خطة جديدة بواسطة الأدمن' })
  @ApiResponse({ status: 200, description: 'تمت عملية الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات غير صحيحة' })
  @ApiResponse({ status: 401, description: 'غير مصرح' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  @ApiResponse({ status: 500, description: 'فشل في عملية الاشتراك' })
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