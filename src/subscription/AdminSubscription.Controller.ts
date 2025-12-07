
import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Logger,
  UseGuards,
  InternalServerErrorException,
  NotFoundException,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CompanyService } from '../company/company.service';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Admin Subscription')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/subscriptions')
export class AdminSubscriptionController {
  private readonly logger = new Logger(AdminSubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly companyService: CompanyService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'جلب جميع الخطط المتاحة' })
  @ApiResponse({ status: 200, description: 'تم جلب الخطط بنجاح' })
  async getPlans() {
    try {
      return await this.subscriptionService.getPlans();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[getPlans] فشل جلب الخطط', errorMessage);
      throw new InternalServerErrorException('فشل جلب الخطط');
    }
  }

  @Post(':companyId/subscribe/:planId')
  @ApiOperation({ summary: 'اشتراك شركة في خطة جديدة (بواسطة الأدمن)' })
  @ApiParam({ name: 'companyId', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة' })
  @ApiResponse({ status: 200, description: 'تم الاشتراك بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات غير صالحة' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async subscribeCompanyToPlan(
    @Param('companyId') companyId: string,
    @Param('planId') planId: string,
  ) {
    this.logger.log(`[subscribeCompanyToPlan] طلب اشتراك جديد من الأدمن: الشركة ${companyId} في الخطة ${planId}`);
    
    try {
      const result = await this.subscriptionService.subscribe(companyId, planId, true);
      
      this.logger.log(`[subscribeCompanyToPlan] تم الاشتراك بنجاح: الشركة ${companyId} في الخطة ${planId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[subscribeCompanyToPlan] فشل اشتراك الشركة ${companyId} في الخطة ${planId}`, errorMessage);
      
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      
      throw new InternalServerErrorException('فشل إتمام الاشتراك');
    }
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'إلغاء اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم إلغاء الاشتراك بنجاح' })
  async cancelSubscription(
    @Param('id') companyId: string
  ) {
    this.logger.log(`[cancelSubscription] استلام طلب إلغاء اشتراك للشركة: ${companyId}`);
    
    try {
      const startTime = Date.now();
      const result = await this.subscriptionService.cancelSubscription(companyId);
      const endTime = Date.now();
      
      this.logger.log(`[cancelSubscription] وقت تنفيذ العملية: ${endTime - startTime}ms`);
      this.logger.log(`[cancelSubscription] تم معالجة طلب إلغاء الاشتراك بنجاح للشركة: ${companyId}`);
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[cancelSubscription] فشل معالجة طلب إلغاء الاشتراك للشركة: ${companyId}`, errorMessage);
      
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`الشركة ${companyId} ليس لديها اشتراكات نشطة`);
      }
      
      throw new InternalServerErrorException('حدث خطأ أثناء إلغاء الاشتراك');
    }
  }

  @Patch(':id/extend')
  @ApiOperation({ summary: 'تمديد اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم تمديد الاشتراك بنجاح' })
  async extendSubscription(
    @Param('id') companyId: string
  ) {
    try {
      this.logger.log(`[extendSubscription] طلب تمديد اشتراك الشركة: ${companyId}`);
      const result = await this.subscriptionService.extendSubscription(companyId);
      this.logger.log(`[extendSubscription] تم تمديد الاشتراك بنجاح للشركة: ${companyId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[extendSubscription] فشل تمديد الاشتراك للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Patch(':id/change-plan')
  @ApiOperation({ summary: 'تغيير خطة اشتراك الشركة (مباشر - باستخدام body)' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  @ApiResponse({ status: 400, description: 'بيانات غير صالحة' })
  @ApiResponse({ status: 404, description: 'الشركة أو الخطة غير موجودة' })
  async changePlan(
    @Param('id') companyId: string,
    @Body() body: { newPlanId: string, adminOverride?: boolean },
  ) {
    try {
      this.logger.log(`[changePlan] === بدء طلب تغيير الخطة ===`);
      this.logger.log(`[changePlan] وصل الطلب لـ changePlan`);
      this.logger.log(`[changePlan] companyId: ${companyId}`);
      this.logger.log(`[changePlan] body: ${JSON.stringify(body)}`);
      
      if (!body.newPlanId) {
        this.logger.error(`[changePlan] newPlanId مفقود في body`);
        throw new BadRequestException('معرف الخطة الجديدة مطلوب');
      }
      
      const adminOverride = body.adminOverride !== undefined ? body.adminOverride : true;
      
      this.logger.log(`[changePlan] استخدام adminOverride = ${adminOverride}`);
      
      const result = await this.subscriptionService.changePlanDirectly(
        companyId, 
        body.newPlanId, 
        adminOverride
      );
      
      this.logger.log(`[changePlan] === نجاح تغيير الخطة ===`);
      this.logger.log(`[changePlan] النتيجة: ${result.message}`);
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : 'No stack trace';
      
      this.logger.error(`[changePlan] === فشل تغيير الخطة ===`);
      this.logger.error(`[changePlan] الشركة: ${companyId}`);
      this.logger.error(`[changePlan] الخطة الجديدة: ${body?.newPlanId}`);
      this.logger.error(`[changePlan] الخطأ: ${errorMessage}`);
      this.logger.error(`[changePlan] Stack Trace: ${stackTrace}`);
      
      throw error;
    }
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'عرض سجل اشتراكات الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب سجل الاشتراكات بنجاح' })
  async getSubscriptionHistory(
    @Param('id') companyId: string
  ) {
    try {
      this.logger.log(`[getSubscriptionHistory] جلب سجل اشتراكات الشركة: ${companyId}`);
      const result = await this.subscriptionService.getSubscriptionHistory(companyId);
      this.logger.log(`[getSubscriptionHistory] تم جلب ${result.length} اشتراك في السجل`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getSubscriptionHistory] فشل جلب سجل الاشتراكات للشركة ${companyId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }

  @Patch(':id/activate/:planId')
  @ApiOperation({ summary: 'تفعيل اشتراك الشركة يدويًا بواسطة الأدمن' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة المطلوب تفعيلها' })
  @ApiResponse({ status: 200, description: 'تم تفعيل الاشتراك بنجاح' })
  async activateSubscriptionManually(
    @Param('id') companyId: string,
    @Param('planId') planId: string,
  ) {
    try {
      this.logger.log(`[activateSubscriptionManually] تفعيل يدوي للشركة ${companyId} في الخطة ${planId}`);
      const result = await this.subscriptionService.subscribe(companyId, planId, true);
      this.logger.log(`[activateSubscriptionManually] تم التفعيل اليدوي بنجاح`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[activateSubscriptionManually] فشل تفعيل الاشتراك يدويًا للشركة ${companyId}`, errorMessage);
      throw new InternalServerErrorException('فشل تفعيل الاشتراك');
    }
  }

  @Get(':id/validate-plan-change/:newPlanId')
  @ApiOperation({ summary: 'التحقق من إمكانية تغيير خطة الشركة (للأدمن)' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم التحقق بنجاح' })
  async validatePlanChange(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ) {
    try {
      this.logger.log(`[validatePlanChange] التحقق من تغيير خطة الشركة ${companyId} إلى ${newPlanId}`);
      const result = await this.subscriptionService.validatePlanChange(companyId, newPlanId);
      this.logger.log(`[validatePlanChange] نتيجة التحقق: ${result.canChange ? 'يمكن التغيير' : 'لا يمكن التغيير'}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[validatePlanChange] فشل التحقق من تغيير الخطة للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Get(':id/current-status')
  @ApiOperation({ summary: 'الحصول على حالة الاشتراك الحالية للشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  async getCurrentStatus(@Param('id') companyId: string) {
    try {
      this.logger.log(`[getCurrentStatus] التحقق من حالة الشركة: ${companyId}`);
      
      const company = await this.companyService.findById(companyId);
      if (!company) {
        throw new NotFoundException('الشركة غير موجودة');
      }
      
      const subscription = await this.subscriptionService.getCompanySubscription(companyId);
      
      const employeeCount = await this.subscriptionService.getCurrentEmployeeCount(companyId);
      
      const allPlans = await this.subscriptionService.getPlans();
      
      return {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          subscriptionStatus: company.subscriptionStatus,
          planId: company.planId,
          subscribedAt: company.subscribedAt,
          paymentProvider: company.paymentProvider
        },
        currentSubscription: subscription ? {
          id: subscription.id,
          planId: subscription.plan?.id,
          planName: subscription.plan?.name,
          maxEmployees: subscription.plan?.maxEmployees,
          price: subscription.plan?.price,
          customMaxEmployees: subscription.customMaxEmployees,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          status: subscription.status,
          subscriptionPrice: subscription.price
        } : null,
        employeeCount: employeeCount,
        allPlans: allPlans.map(plan => ({
          id: plan.id,
          name: plan.name,
          maxEmployees: plan.maxEmployees,
          price: plan.price,
          durationInDays: plan.durationInDays,
          isTrial: plan.isTrial,
          paymentProvider: plan.paymentProvider
        })),
        timestamp: new Date().toISOString(),
        debugInfo: {
          hasActiveSubscription: await this.subscriptionService.hasActiveSubscription(companyId),
          canAddEmployee: await this.subscriptionService.canAddEmployee(companyId),
          allowedEmployees: await this.subscriptionService.getAllowedEmployees(companyId)
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getCurrentStatus] فشل التحقق من الحالة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل التحقق من الحالة');
    }
  }
}