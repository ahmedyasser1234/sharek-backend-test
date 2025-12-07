/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { PaymentService } from '../payment/payment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { PaymentProofStatus } from '../payment/entities/payment-proof-status.enum';
import { SubscriptionDebugInfo } from './interfaces/subscription-debug.interface';



@ApiTags('Admin Subscription')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/subscriptions')
export class AdminSubscriptionController {
  private readonly logger = new Logger(AdminSubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly companyService: CompanyService,
    private readonly paymentService: PaymentService,
    @InjectRepository(PaymentProof)
    private readonly proofRepo: Repository<PaymentProof>,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'جلب جميع الخطط المتاحة' })
  @ApiResponse({ status: 200, description: 'تم جلب الخطط بنجاح' })
  async getPlans(): Promise<ReturnType<SubscriptionService['getPlans']>> {
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
  ): Promise<ReturnType<SubscriptionService['subscribe']>> {
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
  ): Promise<ReturnType<SubscriptionService['cancelSubscription']>> {
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
  ): Promise<ReturnType<SubscriptionService['extendSubscription']>> {
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
  ): Promise<any> {
    try {
      this.logger.log(`[changePlan] === بدء طلب تغيير الخطة ===`);
      this.logger.log(`[changePlan] companyId: ${companyId}`);
      this.logger.log(`[changePlan] newPlanId: ${body.newPlanId}`);
      this.logger.log(`[changePlan] adminOverride: ${body.adminOverride || false}`);
      
      const result = await this.subscriptionService.changePlanDirectly(
        companyId, 
        body.newPlanId, 
        body.adminOverride || false
      );
      
      this.logger.log(`[changePlan] === نجاح تغيير الخطة ===`);
      this.logger.log(`[changePlan] النتيجة: ${JSON.stringify(result, null, 2)}`);
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[changePlan] === فشل تغيير الخطة ===`);
      this.logger.error(`[changePlan] الشركة: ${companyId}`);
      this.logger.error(`[changePlan] الخطة الجديدة: ${body.newPlanId}`);
      this.logger.error(`[changePlan] الخطأ: ${errorMessage}`);
      
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      
      throw new InternalServerErrorException('فشل تغيير الخطة');
    }
  }

  // احتفظ بالدالة القديمة للتوافق
  @Patch(':id/change-plan-old/:newPlanId')
  @ApiOperation({ summary: 'تغيير خطة اشتراك الشركة (طريقة قديمة)' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  async changePlanOld(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<any> {
    try {
      this.logger.log(`[changePlanOld] طلب تغيير خطة الشركة ${companyId} إلى ${newPlanId}`);
      const result = await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId);
      this.logger.log(`[changePlanOld] تم تغيير الخطة بنجاح للشركة: ${companyId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[changePlanOld] فشل تغيير الخطة للشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'عرض سجل اشتراكات الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب سجل الاشتراكات بنجاح' })
  async getSubscriptionHistory(
    @Param('id') companyId: string
  ): Promise<ReturnType<SubscriptionService['getSubscriptionHistory']>> {
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
  ): Promise<ReturnType<SubscriptionService['subscribe']>> {
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
  ): Promise<ReturnType<SubscriptionService['validatePlanChange']>> {
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

  @Post(':id/request-plan-change/:newPlanId')
  @ApiOperation({ summary: 'طلب تغيير خطة الشركة (للأدمن)' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم إرسال الطلب بنجاح' })
  async requestPlanChange(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<ReturnType<SubscriptionService['requestPlanChange']>> {
    try {
      this.logger.log(`[requestPlanChange] طلب تغيير خطة الشركة ${companyId} إلى ${newPlanId}`);
      const result = await this.subscriptionService.requestPlanChange(companyId, newPlanId);
      this.logger.log(`[requestPlanChange] تم إرسال الطلب بنجاح: ${result.success ? 'ناجح' : 'فاشل'}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[requestPlanChange] فشل طلب تغيير الخطة للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Get('manual-proofs')
  @ApiOperation({ summary: 'عرض جميع طلبات التحويل البنكي' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofs() {
    try {
      this.logger.log(`[getManualTransferProofs] جلب جميع طلبات التحويل البنكي`);
      
      const proofs = await this.proofRepo.find({
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      const safeProofs = proofs.map((proof) => ({
        id: proof?.id,
        companyId: proof?.company?.id || 'غير معروف',
        companyName: proof?.company?.name || 'شركة غير معروفة',
        companyEmail: proof?.company?.email || 'بريد غير معروف',
        planId: proof?.plan?.id || 'غير معروف',
        planName: proof?.plan?.name || 'خطة غير معروفة',
        imageUrl: proof?.imageUrl,
        createdAt: proof?.createdAt,
        status: proof?.status, 
        reviewed: proof?.reviewed || false,
        rejected: proof?.rejected || false,
        decisionNote: proof?.decisionNote || '',
      }));

      this.logger.log(`[getManualTransferProofs] تم جلب ${safeProofs.length} طلب تحويل بنكي`);
      return safeProofs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getManualTransferProofs] فشل تحميل الطلبات: ${errorMessage}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('manual-proofs/pending')
  @ApiOperation({ summary: 'عرض طلبات التحويل البنكي المعلقة فقط' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات المعلقة بنجاح' })
  async getPendingManualTransferProofs() {
    try {
      this.logger.log(`[getPendingManualTransferProofs] جلب طلبات التحويل البنكي المعلقة`);
      
      const proofs = await this.proofRepo.find({
        where: { status: PaymentProofStatus.PENDING },
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      const safeProofs = proofs.map((proof) => ({
        id: proof?.id,
        companyId: proof?.company?.id || 'غير معروف',
        companyName: proof?.company?.name || 'شركة غير معروفة',
        companyEmail: proof?.company?.email || 'بريد غير معروف',
        planId: proof?.plan?.id || 'غير معروف',
        planName: proof?.plan?.name || 'خطة غير معروفة',
        imageUrl: proof?.imageUrl,
        createdAt: proof?.createdAt,
        status: proof?.status, 
        reviewed: proof?.reviewed || false,
        rejected: proof?.rejected || false,
        decisionNote: proof?.decisionNote || '',
      }));

      this.logger.log(`[getPendingManualTransferProofs] تم جلب ${safeProofs.length} طلب تحويل بنكي معلق`);
      return safeProofs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getPendingManualTransferProofs] فشل تحميل الطلبات المعلقة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات المعلقة');
    }
  }

  @Get('manual-proofs/status/:status')
  @ApiOperation({ summary: 'عرض طلبات التحويل البنكي حسب الحالة' })
  @ApiParam({ name: 'status', description: 'حالة الطلب (PENDING, APPROVED, REJECTED)' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofsByStatus(@Param('status') status: string) {
    try {
      this.logger.log(`[getManualTransferProofsByStatus] جلب طلبات التحويل بحالة: ${status}`);
      
      let statusEnum: PaymentProofStatus;
      
      switch (status.toUpperCase()) {
        case 'PENDING':
          statusEnum = PaymentProofStatus.PENDING;
          break;
        case 'APPROVED':
          statusEnum = PaymentProofStatus.APPROVED;
          break;
        case 'REJECTED':
          statusEnum = PaymentProofStatus.REJECTED;
          break;
        default:
          throw new BadRequestException('حالة غير صالحة. استخدم: PENDING, APPROVED, REJECTED');
      }

      const proofs = await this.proofRepo.find({
        where: { status: statusEnum },
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      const safeProofs = proofs.map((proof) => ({
        id: proof?.id,
        companyId: proof?.company?.id || 'غير معروف',
        companyName: proof?.company?.name || 'شركة غير معروفة',
        companyEmail: proof?.company?.email || 'بريد غير معروف',
        planId: proof?.plan?.id || 'غير معروف',
        planName: proof?.plan?.name || 'خطة غير معروفة',
        imageUrl: proof?.imageUrl,
        createdAt: proof?.createdAt,
        status: proof?.status, 
        reviewed: proof?.reviewed || false,
        rejected: proof?.rejected || false,
        decisionNote: proof?.decisionNote || '',
      }));

      this.logger.log(`[getManualTransferProofsByStatus] تم جلب ${safeProofs.length} طلب تحويل بنكي بحالة ${status}`);
      return safeProofs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getManualTransferProofsByStatus] فشل تحميل الطلبات بحالة ${status}: ${errorMessage}`);
      
      if (err instanceof BadRequestException) {
        throw err;
      }
      
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('manual-proofs/:proofId')
  @ApiOperation({ summary: 'عرض تفاصيل طلب تحويل بنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الطلب بنجاح' })
  async getManualProofDetails(@Param('proofId') proofId: string) {
    try {
      this.logger.log(`[getManualProofDetails] جلب تفاصيل طلب التحويل: ${proofId}`);
      
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      const safeProof = {
        id: proof?.id,
        companyId: proof?.company?.id || 'غير معروف',
        companyName: proof?.company?.name || 'شركة غير معروفة',
        companyEmail: proof?.company?.email || 'بريد غير معروف',
        planId: proof?.plan?.id || 'غير معروف',
        planName: proof?.plan?.name || 'خطة غير معروفة',
        imageUrl: proof?.imageUrl,
        createdAt: proof?.createdAt,
        status: proof?.status, 
        reviewed: proof?.reviewed || false,
        rejected: proof?.rejected || false,
        decisionNote: proof?.decisionNote || '',
      };

      this.logger.log(`[getManualProofDetails] تم جلب تفاصيل الطلب: ${proofId}`);
      return safeProof;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getManualProofDetails] فشل تحميل تفاصيل الطلب ${proofId}: ${errorMessage}`);
      
      if (err instanceof NotFoundException) {
        throw err;
      }
      
      throw new InternalServerErrorException('فشل تحميل تفاصيل الطلب');
    }
  }

  @Patch('manual-proofs/:proofId/approve')
  @ApiOperation({ summary: 'قبول طلب التحويل البنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم قبول الطلب بنجاح' })
  async approveProof(
    @Param('proofId') proofId: string,
  ): Promise<{ message: string }> {
    try {
      this.logger.log(`[approveProof] قبول طلب التحويل: ${proofId}`);
      
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      if (!proof.company || !proof.plan) {
        throw new BadRequestException('بيانات الطلب غير مكتملة');
      }

      const result = await this.paymentService.approveProof(proofId);
      this.logger.log(`[approveProof] تم قبول الطلب: ${proofId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[approveProof] فشل قبول الطلب ${proofId}`, errorMessage);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل قبول الطلب');
    }
  }

  @Patch('manual-proofs/:proofId/reject')
  @ApiOperation({ summary: 'رفض طلب التحويل البنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم رفض الطلب بنجاح' })
  async rejectProof(
    @Param('proofId') proofId: string,
    @Body() body: { reason: string }
  ): Promise<{ message: string }> {
    try {
      this.logger.log(`[rejectProof] رفض طلب التحويل: ${proofId} - السبب: ${body.reason}`);
      
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      const result = await this.paymentService.rejectProof(proofId, body.reason);
      this.logger.log(`[rejectProof] تم رفض الطلب: ${proofId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[rejectProof] فشل رفض الطلب ${proofId}`, errorMessage);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل رفض الطلب');
    }
  }

  @Get('expiring/:days')
  @ApiOperation({ summary: 'عرض الاشتراكات القريبة من الانتهاء خلال عدد أيام معين' })
  @ApiParam({ name: 'days', description: 'عدد الأيام قبل الانتهاء' })
  async getExpiring(@Param('days') days: string) {
    try {
      const threshold = parseInt(days);
      this.logger.log(`[getExpiring] جلب اشتراكات تنتهي خلال ${threshold} يوم`);
      const result = await this.subscriptionService.getExpiringSubscriptions(threshold);
      this.logger.log(`[getExpiring] تم جلب ${result.length} اشتراك قريب من الانتهاء`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[getExpiring] فشل جلب الاشتراكات القريبة من الانتهاء`, errorMessage);
      throw error;
    }
  }

  @Get('pending-proofs/count')
  @ApiOperation({ summary: 'جلب عدد طلبات التحويل البنكي المعلقة' })
  @ApiResponse({ status: 200, description: 'تم جلب العدد بنجاح' })
  async getPendingProofsCount(): Promise<{ count: number }> {
    try {
      this.logger.log(`[getPendingProofsCount] جلب عدد الطلبات المعلقة`);
      
      const count = await this.proofRepo.count({
        where: { status: PaymentProofStatus.PENDING }
      });
      
      this.logger.log(`[getPendingProofsCount] عدد الطلبات المعلقة: ${count}`);
      return { count };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getPendingProofsCount] فشل جلب عدد الطلبات المعلقة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب عدد الطلبات المعلقة');
    }
  }

@Get(':id/debug')
@ApiOperation({ summary: 'تصحيح حالة اشتراك الشركة (للأدمن)' })
@ApiParam({ name: 'id', description: 'معرف الشركة' })
@ApiResponse({ status: 200, description: 'تم جلب معلومات التصحيح' })
async debugSubscription(
  @Param('id') companyId: string
): Promise<SubscriptionDebugInfo> {
  try {
    this.logger.log(`[debugSubscription] تصحيح حالة اشتراك الشركة: ${companyId}`);
    
    const result = await this.subscriptionService.debugSubscriptionStatus(companyId);
    
    this.logger.log(`[debugSubscription] تم جلب معلومات التصحيح للشركة: ${companyId}`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`[debugSubscription] فشل تصحيح حالة اشتراك الشركة ${companyId}: ${errorMessage}`);
    throw new InternalServerErrorException('فشل تصحيح حالة الاشتراك');
  }
}
}