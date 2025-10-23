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

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'إلغاء اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم إلغاء الاشتراك بنجاح' })
  async cancelSubscription(
    @Param('id') companyId: string
  ): Promise<ReturnType<SubscriptionService['cancelSubscription']>> {
    try {
      return await this.subscriptionService.cancelSubscription(companyId);
    } catch (error: unknown) {
      this.logger.error(`فشل إلغاء الاشتراك للشركة ${companyId}`, error as any);
      throw error;
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

  @Get('manual-proofs')
  @ApiOperation({ summary: 'عرض جميع طلبات التحويل البنكي' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getManualTransferProofs() {
    try {
      const proofs = await this.proofRepo.find({
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      return proofs.map((proof) => ({
        id: proof.id,
        companyId: proof.company.id,
        companyName: proof.company.name,
        companyEmail: proof.company.email,
        planId: proof.plan.id,
        planName: proof.plan.name,
        imageUrl: proof.imageUrl,
        createdAt: proof.createdAt,
        reviewed: proof.reviewed,
        rejected: proof.rejected,
        decisionNote: proof.decisionNote,
      }));
    } catch (err) {
      this.logger.error(`فشل تحميل الطلبات: ${String(err)}`);
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

      if (!proof) throw new NotFoundException('الطلب غير موجود');

      return {
        id: proof.id,
        companyId: proof.company.id,
        companyName: proof.company.name,
        companyEmail: proof.company.email,
        planId: proof.plan.id,
        planName: proof.plan.name,
        imageUrl: proof.imageUrl,
        createdAt: proof.createdAt,
        reviewed: proof.reviewed,
        rejected: proof.rejected,
        decisionNote: proof.decisionNote,
      };
    } catch (err) {
      this.logger.error(`فشل تحميل تفاصيل الطلب ${proofId}: ${String(err)}`);
      throw new InternalServerErrorException('فشل تحميل تفاصيل الطلب');
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
      return await this.paymentService.rejectProof(proofId, body.reason);
    } catch (error: unknown) {
      this.logger.error(`فشل رفض الطلب ${proofId}`, error as any);
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

}
