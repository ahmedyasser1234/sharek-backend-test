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
      this.logger.error('فشل جلب الخطط', error as any);
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
    this.logger.log(` طلب اشتراك جديد من الأدمن: الشركة ${companyId} في الخطة ${planId}`);
    
    try {
      const result = await this.subscriptionService.subscribe(companyId, planId, true);
      
      this.logger.log(` تم الاشتراك بنجاح: الشركة ${companyId} في الخطة ${planId}`);
      return result;
    } catch (error: unknown) {
      this.logger.error(` فشل اشتراك الشركة ${companyId} في الخطة ${planId}`, error as any);
      
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
    this.logger.log(` استلام طلب إلغاء اشتراك للشركة: ${companyId}`);
    
    try {
      const startTime = Date.now();
      const result = await this.subscriptionService.cancelSubscription(companyId);
      const endTime = Date.now();
      
      this.logger.log(` وقت تنفيذ العملية: ${endTime - startTime}ms`);
      this.logger.log(` تم معالجة طلب إلغاء الاشتراك بنجاح للشركة: ${companyId}`);
      
      return result;
    } catch (error: unknown) {
      this.logger.error(` فشل معالجة طلب إلغاء الاشتراك للشركة: ${companyId}`, error as any);
      
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
      return await this.subscriptionService.extendSubscription(companyId);
    } catch (error: unknown) {
      this.logger.error(`فشل تمديد الاشتراك للشركة ${companyId}`, error as any);
      throw error;
    }
  }

  @Patch(':id/change-plan/:newPlanId')
  @ApiOperation({ summary: 'تغيير خطة اشتراك الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  async changePlan(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ): Promise<ReturnType<SubscriptionService['changeSubscriptionPlan']>> {
    try {
      return await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId);
    } catch (error: unknown) {
      this.logger.error(`فشل تغيير الخطة للشركة ${companyId}`, error as any);
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
      return await this.subscriptionService.getSubscriptionHistory(companyId);
    } catch (error: unknown) {
      this.logger.error(`فشل جلب سجل الاشتراكات للشركة ${companyId}`, error as any);
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
      return await this.subscriptionService.subscribe(companyId, planId, true);
    } catch (error: unknown) {
      this.logger.error(`فشل تفعيل الاشتراك يدويًا للشركة ${companyId}`, error as any);
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
      return await this.subscriptionService.validatePlanChange(companyId, newPlanId);
    } catch (error: unknown) {
      this.logger.error(`فشل التحقق من تغيير الخطة للشركة ${companyId}`, error as any);
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
      return await this.subscriptionService.requestPlanChange(companyId, newPlanId);
    } catch (error: unknown) {
      this.logger.error(`فشل طلب تغيير الخطة للشركة ${companyId}`, error as any);
      throw error;
    }
  }

  @Get('manual-proofs')
  @ApiOperation({ summary: 'عرض جميع طلبات التحويل البنكي' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofs() {
    try {
      // إزالة شرط الحالة PENDING لجلب جميع الطلبات
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

      this.logger.log(`تم جلب ${safeProofs.length} طلب تحويل بنكي`);
      return safeProofs;
    } catch (err) {
      this.logger.error(`فشل تحميل الطلبات: ${String(err)}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('manual-proofs/pending')
  @ApiOperation({ summary: 'عرض طلبات التحويل البنكي المعلقة فقط' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات المعلقة بنجاح' })
  async getPendingManualTransferProofs() {
    try {
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

      this.logger.log(`تم جلب ${safeProofs.length} طلب تحويل بنكي معلق`);
      return safeProofs;
    } catch (err) {
      this.logger.error(`فشل تحميل الطلبات المعلقة: ${String(err)}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات المعلقة');
    }
  }

  @Get('manual-proofs/status/:status')
  @ApiOperation({ summary: 'عرض طلبات التحويل البنكي حسب الحالة' })
  @ApiParam({ name: 'status', description: 'حالة الطلب (PENDING, APPROVED, REJECTED)' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofsByStatus(@Param('status') status: string) {
    try {
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

      this.logger.log(`تم جلب ${safeProofs.length} طلب تحويل بنكي بحالة ${status}`);
      return safeProofs;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`فشل تحميل الطلبات بحالة ${status}: ${String(err)}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('manual-proofs/:proofId')
  @ApiOperation({ summary: 'عرض تفاصيل طلب تحويل بنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الطلب بنجاح' })
  async getManualProofDetails(@Param('proofId') proofId: string) {
    try {
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

      return safeProof;
    } catch (err) {
      this.logger.error(`فشل تحميل تفاصيل الطلب ${proofId}: ${String(err)}`);
      
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

      return await this.paymentService.approveProof(proofId);
    } catch (error: unknown) {
      this.logger.error(`فشل قبول الطلب ${proofId}`, error as any);
      
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
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      return await this.paymentService.rejectProof(proofId, body.reason);
    } catch (error: unknown) {
      this.logger.error(`فشل رفض الطلب ${proofId}`, error as any);
      
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
    const threshold = parseInt(days);
    return await this.subscriptionService.getExpiringSubscriptions(threshold);
  }

  @Get('pending-proofs/count')
  @ApiOperation({ summary: 'جلب عدد طلبات التحويل البنكي المعلقة' })
  @ApiResponse({ status: 200, description: 'تم جلب العدد بنجاح' })
  async getPendingProofsCount(): Promise<{ count: number }> {
    try {
      const count = await this.proofRepo.count({
        where: { status: PaymentProofStatus.PENDING }
      });
      
      return { count };
    } catch (err) {
      this.logger.error(`فشل جلب عدد الطلبات المعلقة: ${String(err)}`);
      throw new InternalServerErrorException('فشل جلب عدد الطلبات المعلقة');
    }
  }
}