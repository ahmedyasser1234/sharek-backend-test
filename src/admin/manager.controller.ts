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
  ForbiddenException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { SellerService } from './manager.service';
import { ManagerJwtGuard } from './auth/manager-jwt.guard';
import { TokenRefreshInterceptor } from '../common/interceptors/token-refresh.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Company } from '../company/entities/company.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity';
import { CompanyWithEmployeeCountDto } from './dto/company-response.dto';

interface ManagerRequest extends Request {
  user?: { managerId: string; role: string };
  managerPayload?: { managerId: string; role: string };
}

@ApiTags('Seller')
@Controller('seller')
@UseInterceptors(TokenRefreshInterceptor)
export class SellerController {
  private readonly logger = new Logger(SellerController.name);

  constructor(private readonly service: SellerService) {}

  @Post('refresh')
  @ApiOperation({ summary: 'تجديد توكن البائع' })
  async refresh(@Body() body: { refreshToken: string }) {
    try {
      this.logger.log('محاولة تجديد توكن البائع');
      const result = await this.service.refresh(body.refreshToken);
      this.logger.log('تم تجديد التوكن بنجاح');
      return result;
    } catch (error: unknown) {
      // التصحيح: تحقق من نوع error أولاً
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل تجديد التوكن: ${errorMessage}`);
      throw error;
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'تسجيل دخول البائع' })
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Post('logout')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل خروج البائع' })
  logout(@Body() body: { refreshToken?: string }) {
    const refreshToken = body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    return this.service.logout(refreshToken);
  }

  @Get('stats')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إحصائيات النظام' })
  getStats(@Req() req: ManagerRequest) {
    const sellerId = req.user?.managerId;
    return this.service.getStats(sellerId);
  }

  @Get('companies')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الشركات' })
  @ApiResponse({ 
    status: 200, 
    description: 'تم جلب الشركات بنجاح',
    type: [CompanyWithEmployeeCountDto] 
  })
  getCompanies(@Req() req: ManagerRequest): Promise<CompanyWithEmployeeCountDto[]> {
    const sellerId = req.user?.managerId;
    return this.service.getAllCompaniesWithEmployeeCount(sellerId);
  }

  @Get('my-companies')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض شركات البائع الخاص' })
  @ApiResponse({ 
    status: 200, 
    description: 'تم جلب شركات البائع بنجاح',
    type: [CompanyWithEmployeeCountDto] 
  })
  async getMyCompanies(@Req() req: ManagerRequest): Promise<CompanyWithEmployeeCountDto[]> {
    const sellerId = req.user?.managerId;
    
    if (!sellerId) {
      this.logger.warn('لم يتم العثور على sellerId في الطلب رغم وجود الـ Guard');
      
      // التصحيح: استخدام type assertion آمن
      const requestWithPayload = req as unknown as { managerPayload?: { managerId: string } };
      const payload = requestWithPayload.managerPayload;
      
      if (payload?.managerId) {
        this.logger.log(`استخدام managerPayload للبائع: ${payload.managerId}`);
        return this.service.getSellerCompanies(payload.managerId);
      }
      throw new UnauthorizedException('غير مصرح - يرجى تسجيل الدخول مرة أخرى');
    }
    
    this.logger.log(`جلب شركات البائع: ${sellerId}`);
    return this.service.getSellerCompanies(sellerId);
  }

  @Patch('companies/:id/activate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل شركة' })
  activateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, true);
  }

  @Patch('companies/:id/deactivate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء تفعيل شركة' })
  deactivateCompany(@Param('id') id: string) {
    return this.service.toggleCompany(id, false);
  }

  @Put('companies/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  updateCompany(@Param('id') id: string, @Body() dto: Partial<Company>) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شركة' })
  deleteCompany(@Param('id') id: string) {
    return this.service.deleteCompany(id);
  }

  @Get('employees/:companyId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض موظفي الشركة' })
  getEmployees(@Param('companyId') companyId: string) {
    return this.service.getEmployeesByCompany(companyId);
  }

  @Delete('employees/:id')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف موظف' })
  deleteEmployee(@Param('id') id: number) {
    return this.service.deleteEmployee(id);
  }

  @Get('subscriptions')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع الاشتراكات' })
  getSubscriptions(@Req() req: ManagerRequest) {
    const sellerId = req.user?.managerId;
    return this.service.getAllSubscriptions(sellerId);
  }

  @Patch('subscriptions/:id/activate')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك' })
  activateSubscription(@Param('id') id: string) {
    return this.service.activateSubscription(id);
  }

  @Post('subscriptions/:companyId/subscribe/:planId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'اشتراك شركة في خطة جديدة' })
  @ApiParam({ name: 'companyId', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات غير صالحة' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async subscribeCompanyToPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ManagerRequest
  ): Promise<any> {
    const sellerId = req.user?.managerId;
    if (!sellerId) throw new UnauthorizedException('غير مصرح');

    this.logger.log(`طلب اشتراك جديد من البائع ${sellerId}: الشركة ${companyId} في الخطة ${planId}`);
    
    try {
      const result = await this.service.subscribeCompanyToPlan(companyId, planId, sellerId);
      this.logger.log(`تم الاشتراك بنجاح: الشركة ${companyId} في الخطة ${planId} بواسطة البائع ${sellerId}`);
      return result;
    } catch (error: unknown) {
      // التصحيح: استخدام String() بدلاً من error.message مباشرة
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل اشتراك الشركة ${companyId} في الخطة ${planId}`, errorMessage);
      
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      
      throw new InternalServerErrorException('فشل إتمام الاشتراك');
    }
  }

  @Patch('subscriptions/:id/cancel')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إلغاء اشتراك شركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم إلغاء الاشتراك بنجاح' })
  async cancelSubscription(@Param('id') companyId: string): Promise<any> {
    this.logger.log(`استلام طلب إلغاء اشتراك للشركة: ${companyId}`);
    
    try {
      const result = await this.service.cancelSubscription(companyId);
      this.logger.log(`تم معالجة طلب إلغاء الاشتراك بنجاح للشركة: ${companyId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل معالجة طلب إلغاء الاشتراك للشركة: ${companyId}`, errorMessage);
      
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`الشركة ${companyId} ليس لديها اشتراكات نشطة`);
      }
      
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  @Patch('subscriptions/:id/extend')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تمديد اشتراك شركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم تمديد الاشتراك بنجاح' })
  async extendSubscription(@Param('id') companyId: string): Promise<any> {
    try {
      return await this.service.extendSubscription(companyId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تمديد الاشتراك للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Patch('subscriptions/:id/change-plan/:newPlanId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير خطة اشتراك شركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  async changeSubscriptionPlan(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<any> {
    try {
      return await this.service.changeSubscriptionPlanSeller(companyId, newPlanId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تغيير الخطة للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Patch('subscriptions/:id/activate-manually/:planId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تفعيل اشتراك شركة يدويًا' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة المطلوب تفعيلها' })
  @ApiResponse({ status: 200, description: 'تم تفعيل الاشتراك بنجاح' })
  async activateSubscriptionManually(
    @Param('id') companyId: string,
    @Param('planId') planId: string,
    @Req() req: ManagerRequest
  ): Promise<any> {
    const sellerId = req.user?.managerId;
    if (!sellerId) throw new UnauthorizedException('غير مصرح');

    try {
      return await this.service.activateSubscriptionManually(companyId, planId, sellerId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تفعيل الاشتراك يدويًا للشركة ${companyId}`, errorMessage);
      throw new InternalServerErrorException('فشل تفعيل الاشتراك');
    }
  }

  @Get('subscriptions/:id/history')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض سجل اشتراكات الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب سجل الاشتراكات بنجاح' })
  async getSubscriptionHistory(@Param('id') companyId: string): Promise<CompanySubscription[]> {
    try {
      return await this.service.getSubscriptionHistory(companyId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب سجل الاشتراكات للشركة ${companyId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  @Get('subscriptions/:id/validate-plan-change/:newPlanId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'التحقق من إمكانية تغيير خطة الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم التحقق بنجاح' })
  async validatePlanChange(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<any> {
    try {
      return await this.service.validatePlanChange(companyId, newPlanId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل التحقق من تغيير الخطة للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Get('subscriptions/expiring/:days')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض الاشتراكات القريبة من الانتهاء' })
  @ApiParam({ name: 'days', description: 'عدد الأيام قبل الانتهاء' })
  async getExpiringSubscriptions(@Param('days') days: string, @Req() req: ManagerRequest): Promise<CompanySubscription[]> {
    const sellerId = req.user?.managerId;
    
    try {
      const threshold = parseInt(days);
      return await this.service.getExpiringSubscriptions(threshold, sellerId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الاشتراكات القريبة من الانتهاء`, errorMessage);
      throw new InternalServerErrorException('فشل جلب الاشتراكات');
    }
  }

  @Get('subscriptions/manual-proofs')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض جميع طلبات التحويل البنكي' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofs(): Promise<any> {
    try {
      return await this.service.getManualTransferProofs();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تحميل طلبات التحويل`, errorMessage);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('subscriptions/manual-proofs/:proofId')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'عرض تفاصيل طلب تحويل بنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الطلب بنجاح' })
  async getManualProofDetails(@Param('proofId') proofId: string): Promise<any> {
    try {
      return await this.service.getManualProofDetails(proofId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تحميل تفاصيل الطلب ${proofId}`, errorMessage);
      throw new InternalServerErrorException('فشل تحميل تفاصيل الطلب');
    }
  }

  @Patch('subscriptions/manual-proofs/:proofId/approve')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'قبول طلب التحويل البنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم قبول الطلب بنجاح' })
  async approveProof(@Param('proofId') proofId: string): Promise<any> {
    try {
      return await this.service.approveProof(proofId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل قبول الطلب ${proofId}`, errorMessage);
      throw new InternalServerErrorException('فشل قبول الطلب');
    }
  }

  @Patch('subscriptions/manual-proofs/:proofId/reject')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'رفض طلب التحويل البنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم رفض الطلب بنجاح' })
  async rejectProof(
    @Param('proofId') proofId: string,
    @Body() body: { reason: string }
  ): Promise<any> {
    try {
      return await this.service.rejectProof(proofId, body.reason);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل رفض الطلب ${proofId}`, errorMessage);
      throw new InternalServerErrorException('فشل رفض الطلب');
    }
  }

  @Get('download-database')
  @UseGuards(ManagerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تحميل قاعدة البيانات (محظور للبائع)' })
  downloadDatabase() {
    throw new ForbiddenException('غير مسموح للبائع بتحميل قاعدة البيانات');
  }
}