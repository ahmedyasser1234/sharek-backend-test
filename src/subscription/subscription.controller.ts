import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  UseInterceptors, 
  UploadedFile
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CompanyService } from '../company/company.service';
import { CompanySubscription } from './entities/company-subscription.entity';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiConsumes
} from '@nestjs/swagger';
import { PaymentProvider } from '../payment/payment-provider.enum';
import { PaymentService } from '../payment/payment.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Plan } from '../plan/entities/plan.entity';
import { 
  SubscriptionResponse,
  PlanChangeValidation,
  PlanChangeRequestResult,
  PlanChangeResult 
} from './subscription.service';

@ApiTags('Subscription')
@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly companyService: CompanyService,
    private readonly paymentService: PaymentService
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'جلب جميع الخطط المتاحة' })
  @ApiResponse({ status: 200, description: 'تم جلب الخطط بنجاح' })
  async getPlans(): Promise<Plan[]> {
    try {
      return await this.subscriptionService.getPlans();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الخطط: ${msg}`);
      throw new HttpException(`فشل جلب الخطط: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('company/:id/subscribe/:planId')
  @ApiOperation({ summary: 'اشتراك شركة في خطة معينة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة' })
  @ApiResponse({ status: 201, description: 'تم الاشتراك بنجاح' })
  async subscribe(
    @Param('id') companyId: string,
    @Param('planId') planId: string,
  ): Promise<SubscriptionResponse> {
    try {
      return await this.subscriptionService.subscribe(companyId, planId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل الاشتراك: ${msg}`);
      throw new HttpException(`فشل الاشتراك: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('company/:id/subscription')
  @ApiOperation({ summary: 'جلب اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب الاشتراك بنجاح' })
  async getCompanySubscription(
    @Param('id') companyId: string
  ): Promise<CompanySubscription | null> {
    try {
      return await this.subscriptionService.getCompanySubscription(companyId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب الاشتراك: ${msg}`);
      throw new HttpException(`فشل جلب الاشتراك: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
 
  @Get('company/:id/usage')
  @ApiOperation({ summary: 'جلب استخدام الشركة الحالي من الاشتراك' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب الاستخدام بنجاح' })
  async getUsage(
    @Param('id') companyId: string
  ): Promise<{
    allowed: number;
    current: number;
    remaining: number;
    currentSubscription: CompanySubscription | null;
    isExpired: boolean;
  }> {
    try {
      const subscription = await this.subscriptionService.getCompanySubscription(companyId);
      const allowed: number = subscription?.plan?.maxEmployees || 0;
      const current: number = await this.companyService.countEmployees(companyId);

      const now = new Date();
      const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;

      return {
        allowed,
        current,
        remaining: allowed - current,
        currentSubscription: subscription,
        isExpired,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل جلب استخدام الشركة: ${msg}`);
      throw new HttpException(`فشل جلب استخدام الشركة: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('company/:id/manual-subscribe/:planId')
  @ApiOperation({ summary: 'بدء اشتراك يدوي (تحويل بنكي) مع رفع إيصال' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'تم إرسال طلب الاشتراك اليدوي بنجاح' })
  @UseInterceptors(FileInterceptor('file'))
  async startManualSubscription(
    @Param('id') companyId: string,
    @Param('planId') planId: string,
    @UploadedFile() file: Express.Multer.File
  ): Promise<{ message: string }> {
    try {
      const plans = await this.subscriptionService.getPlans();
      const plan = plans.find(p => p.id === planId);
      if (!plan) throw new NotFoundException('الخطة غير موجودة');

      const isManualPaymentAllowed =
        plan.paymentProvider?.toString() === PaymentProvider.MANUAL_TRANSFER;

      if (!isManualPaymentAllowed) {
        throw new HttpException('الخطة لا تدعم الدفع اليدوي', HttpStatus.BAD_REQUEST);
      }

      if (!file || !file.buffer) {
        throw new HttpException('الصورة مطلوبة لإثبات الدفع', HttpStatus.BAD_REQUEST);
      }

      await this.paymentService.handleManualTransferProof({ companyId, planId }, file);

      return { message: 'تم إرسال وصل التحويل، سيتم مراجعته من قبل الإدارة' };
    } catch (error: unknown) {
      const msg = error instanceof Error && typeof error.message === 'string'
        ? error.message
        : 'Unknown error';
      this.logger.error(`فشل الاشتراك اليدوي: ${msg}`);
      throw new HttpException(`فشل الاشتراك اليدوي: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('company/:id/validate-plan-change/:newPlanId')
  @ApiOperation({ summary: 'التحقق من إمكانية تغيير خطة الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم التحقق بنجاح' })
  async validatePlanChange(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<PlanChangeValidation> {
    try {
      const result: PlanChangeValidation = await this.subscriptionService.validatePlanChange(companyId, newPlanId);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل التحقق من تغيير الخطة: ${msg}`);
      throw new HttpException(`فشل التحقق من تغيير الخطة: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('company/:id/request-plan-change/:newPlanId')
  @ApiOperation({ summary: 'طلب تغيير خطة الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم إرسال الطلب بنجاح' })
  async requestPlanChange(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<PlanChangeRequestResult> {
    try {
      const result: PlanChangeRequestResult = await this.subscriptionService.requestPlanChange(companyId, newPlanId);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل طلب تغيير الخطة: ${msg}`);
      throw new HttpException(`فشل طلب تغيير الخطة: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('company/:id/change-plan/:newPlanId')
  @ApiOperation({ summary: 'تغيير خطة الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  async changePlan(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<PlanChangeResult> {
    try {
      const result: PlanChangeResult = await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تغيير الخطة: ${msg}`);
      throw new HttpException(`فشل تغيير الخطة: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}