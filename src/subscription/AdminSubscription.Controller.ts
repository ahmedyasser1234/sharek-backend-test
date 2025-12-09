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
  UseInterceptors,
  ClassSerializerInterceptor,
  Query,
  Req,
  UnauthorizedException,
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
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentService } from '../payment/payment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { PaymentProofStatus } from '../payment/entities/payment-proof-status.enum';
import { Request } from 'express';

interface ExtendedAdminRequest extends Request {
  user?: { adminId: string; role: string };
}

interface ProofResponse {
  id: string;
  companyId: string;
  companyName: string;
  companyEmail: string;
  planId: string;
  planName: string;
  imageUrl: string;
  publicId: string | null;
  createdAt: Date;
  status: PaymentProofStatus;
  reviewed: boolean;
  rejected: boolean;
  decisionNote: string;
  approvedById: string | null;
}

interface ProofStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  stats: {
    pendingPercentage: number;
    approvedPercentage: number;
    rejectedPercentage: number;
  };
}

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
    @Req() req: ExtendedAdminRequest
  ) {
    this.logger.log(`[subscribeCompanyToPlan] طلب اشتراك جديد من الأدمن: الشركة ${companyId} في الخطة ${planId}`);
    
    try {
      let adminEmail: string | undefined;
      const adminId = req.user?.adminId;
      if (adminId) {
        try {
          adminEmail = await this.subscriptionService.getAdminEmail(adminId);
        } catch (error) {
          this.logger.warn(`[subscribeCompanyToPlan] فشل الحصول على بريد الأدمن: ${error}`);
          adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        }
      }
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        true,
        undefined,
        adminId,
        adminEmail
      );
      
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
    @Param('id') companyId: string,
    @Req() req: ExtendedAdminRequest,
    @Body() body?: { reason?: string }
  ) {
    this.logger.log(`[cancelSubscription] استلام طلب إلغاء اشتراك للشركة: ${companyId}`);
    
    try {
      const adminId = req.user?.adminId;
      if (!adminId) throw new UnauthorizedException('غير مصرح');
      
      let adminEmail: string | undefined;
      try {
        adminEmail = await this.subscriptionService.getAdminEmail(adminId);
        this.logger.log(`[cancelSubscription] بريد الأدمن: ${adminEmail || 'غير متاح'}`);
      } catch (error) {
        this.logger.warn(`[cancelSubscription] فشل الحصول على بريد الأدمن: ${error}`);
        adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        this.logger.log(`[cancelSubscription] استخدام البريد الافتراضي: ${adminEmail}`);
      }
      
      const startTime = Date.now();
      const result = await this.subscriptionService.cancelSubscription(
        companyId, 
        adminId, 
        adminEmail, 
        body?.reason
      );
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
    @Param('id') companyId: string,
    @Req() req: ExtendedAdminRequest
  ) {
    try {
      this.logger.log(`[extendSubscription] طلب تمديد اشتراك الشركة: ${companyId}`);
      
      const adminId = req.user?.adminId;
      if (!adminId) throw new UnauthorizedException('غير مصرح');
      
      let adminEmail: string | undefined;
      try {
        adminEmail = await this.subscriptionService.getAdminEmail(adminId);
        this.logger.log(`[extendSubscription] بريد الأدمن: ${adminEmail || 'غير متاح'}`);
      } catch (error) {
        this.logger.warn(`[extendSubscription] فشل الحصول على بريد الأدمن: ${error}`);
        adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        this.logger.log(`[extendSubscription] استخدام البريد الافتراضي: ${adminEmail}`);
      }
      
      const result = await this.subscriptionService.extendSubscription(
        companyId, 
        adminId, 
        adminEmail, 
        365
      );
      
      this.logger.log(`[extendSubscription] تم تمديد الاشتراك بنجاح للشركة: ${companyId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[extendSubscription] فشل تمديد الاشتراك للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  @Patch(':id/change-plan')
  @UseInterceptors(ClassSerializerInterceptor)
  async changePlan(
    @Param('id') companyId: string,
    @Body() body: { newPlanId: string, adminOverride?: boolean, adminEmail?: string },
    @Req() req: ExtendedAdminRequest
  ) {
    try {
      console.log('===========================================');
      console.log(' [DEBUG] changePlan called!');
      console.log('companyId:', companyId);
      console.log('body:', body);
      console.log('===========================================');
      
      this.logger.log(`[changePlan] === بدء طلب تغيير الخطة ===`);
      this.logger.log(`[changePlan] companyId: ${companyId}`);
      this.logger.log(`[changePlan] body: ${JSON.stringify(body)}`);
      
      if (!body || !body.newPlanId) {
        this.logger.error(`[changePlan] newPlanId مفقود في body`);
        throw new BadRequestException('معرف الخطة الجديدة مطلوب في body');
      }
      
      const adminOverride = body.adminOverride !== undefined ? body.adminOverride : true;
      
      this.logger.log(`[changePlan] استخدام adminOverride = ${adminOverride}`);
      
      let adminEmail = body.adminEmail;
      if (!adminEmail) {
        const adminId = req.user?.adminId;
        if (adminId) {
          try {
            adminEmail = await this.subscriptionService.getAdminEmail(adminId);
          } catch (error) {
            this.logger.warn(`[changePlan] فشل الحصول على بريد الأدمن: ${error}`);
          }
        }
        
        if (!adminEmail) {
          adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        }
      }
      
      console.log(' [DEBUG] Calling changePlanDirectly...');
      const result = await this.subscriptionService.changePlanDirectly(
        companyId, 
        body.newPlanId, 
        adminOverride,
        adminEmail
      );
      console.log(' [DEBUG] Result:', result);
      
      this.logger.log(`[changePlan] === نجاح تغيير الخطة ===`);
      this.logger.log(`[changePlan] النتيجة: ${JSON.stringify(result)}`);
      
      return {
        success: true,
        message: 'تم تغيير الخطة بنجاح',
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.log(' [DEBUG] ERROR:', errorMessage);
      this.logger.error(`[changePlan] === فشل تغيير الخطة ===`);
      this.logger.error(`[changePlan] الشركة: ${companyId}`);
      this.logger.error(`[changePlan] الخطة الجديدة: ${body?.newPlanId}`);
      this.logger.error(`[changePlan] الخطأ: ${errorMessage}`);
      
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('فشل تغيير الخطة');
    }
  }

  @Patch(':id/change-plan/:newPlanId')
  @ApiOperation({ summary: 'تغيير خطة اشتراك الشركة (طريقة قديمة - للتوافق)' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  async changePlanOld(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
    @Req() req: ExtendedAdminRequest
  ) {
    try {
      this.logger.log(`[changePlanOld] طلب تغيير خطة (طريقة قديمة): الشركة ${companyId} إلى ${newPlanId}`);
      
      let adminEmail: string | undefined;
      const adminId = req.user?.adminId;
      if (adminId) {
        try {
          adminEmail = await this.subscriptionService.getAdminEmail(adminId);
        } catch (error) {
          this.logger.warn(`[changePlanOld] فشل الحصول على بريد الأدمن: ${error}`);
          adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        }
      }
      
      const result = await this.subscriptionService.changePlanDirectly(
        companyId,
        newPlanId,
        true,
        adminEmail
      );
      
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
    @Req() req: ExtendedAdminRequest
  ) {
    try {
      this.logger.log(`[activateSubscriptionManually] تفعيل يدوي للشركة ${companyId} في الخطة ${planId}`);
      
      let adminEmail: string | undefined;
      const adminId = req.user?.adminId;
      if (adminId) {
        try {
          adminEmail = await this.subscriptionService.getAdminEmail(adminId);
        } catch (error) {
          this.logger.warn(`[activateSubscriptionManually] فشل الحصول على بريد الأدمن: ${error}`);
          adminEmail = process.env.ADMIN_EMAIL || 'admin@sharik-sa.com';
        }
      }
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        true, 
        undefined, 
        adminId, 
        adminEmail
      );
      
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


  @Get('manual-proofs')
  @ApiOperation({ summary: 'عرض جميع طلبات التحويل البنكي (بجميع الحالات)' })
  @ApiQuery({ name: 'status', required: false, enum: PaymentProofStatus, description: 'فلتر حسب الحالة' })
  @ApiQuery({ name: 'companyId', required: false, description: 'فلتر حسب الشركة' })
  @ApiQuery({ name: 'planId', required: false, description: 'فلتر حسب الخطة' })
  @ApiResponse({ status: 200, description: 'تم جلب جميع الطلبات بنجاح' })
  async getManualTransferProofs(
    @Query('status') status?: PaymentProofStatus,
    @Query('companyId') companyId?: string,
    @Query('planId') planId?: string,
  ): Promise<ProofResponse[]> {
    try {
      const queryBuilder = this.proofRepo
        .createQueryBuilder('proof')
        .leftJoinAndSelect('proof.company', 'company')
        .leftJoinAndSelect('proof.plan', 'plan')
        .orderBy('proof.createdAt', 'DESC');

      if (status) {
        queryBuilder.andWhere('proof.status = :status', { status });
      }
      
      if (companyId) {
        queryBuilder.andWhere('company.id = :companyId', { companyId });
      }
      
      if (planId) {
        queryBuilder.andWhere('plan.id = :planId', { planId });
      }

      const proofs = await queryBuilder.getMany();

      const safeProofs: ProofResponse[] = proofs.map((proof) => ({
        id: proof.id,
        companyId: proof.company?.id || 'غير معروف',
        companyName: proof.company?.name || 'شركة غير معروفة',
        companyEmail: proof.company?.email || 'بريد غير معروف',
        planId: proof.plan?.id || 'غير معروف',
        planName: proof.plan?.name || 'خطة غير معروفة',
        imageUrl: proof.imageUrl,
        publicId: proof.publicId,
        createdAt: proof.createdAt,
        status: proof.status,
        reviewed: proof.reviewed || false,
        rejected: proof.rejected || false,
        decisionNote: proof.decisionNote || '',
        approvedById: proof.approvedById,
      }));

      this.logger.log(`[getManualTransferProofs] تم جلب ${safeProofs.length} طلب تحويل بنكي`);
      return safeProofs;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getManualTransferProofs] فشل تحميل الطلبات: ${errorMessage}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }

  @Get('manual-proofs/pending')
  @ApiOperation({ summary: 'عرض الطلبات المعلقة فقط' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات المعلقة بنجاح' })
  async getPendingManualProofs(): Promise<ProofResponse[]> {
    try {
      const proofs = await this.proofRepo.find({
        where: { status: PaymentProofStatus.PENDING },
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      const safeProofs: ProofResponse[] = proofs.map((proof) => ({
        id: proof.id,
        companyId: proof.company?.id || 'غير معروف',
        companyName: proof.company?.name || 'شركة غير معروفة',
        companyEmail: proof.company?.email || 'بريد غير معروف',
        planId: proof.plan?.id || 'غير معروف',
        planName: proof.plan?.name || 'خطة غير معروفة',
        imageUrl: proof.imageUrl,
        publicId: proof.publicId,
        createdAt: proof.createdAt,
        status: proof.status,
        reviewed: proof.reviewed || false,
        rejected: proof.rejected || false,
        decisionNote: proof.decisionNote || '',
        approvedById: proof.approvedById,
      }));

      this.logger.log(`[getPendingManualProofs] تم جلب ${safeProofs.length} طلب تحويل بنكي معلق`);
      return safeProofs;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getPendingManualProofs] فشل تحميل الطلبات المعلقة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات المعلقة');
    }
  }

  @Get('manual-proofs/:proofId')
  @ApiOperation({ summary: 'عرض تفاصيل طلب تحويل بنكي' })
  @ApiParam({ name: 'proofId', description: 'معرف الطلب' })
  @ApiResponse({ status: 200, description: 'تم جلب تفاصيل الطلب بنجاح' })
  async getManualProofDetails(@Param('proofId') proofId: string): Promise<ProofResponse> {
    try {
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      const safeProof: ProofResponse = {
        id: proof.id,
        companyId: proof.company?.id || 'غير معروف',
        companyName: proof.company?.name || 'شركة غير معروفة',
        companyEmail: proof.company?.email || 'بريد غير معروف',
        planId: proof.plan?.id || 'غير معروف',
        planName: proof.plan?.name || 'خطة غير معروفة',
        imageUrl: proof.imageUrl,
        publicId: proof.publicId,
        createdAt: proof.createdAt,
        status: proof.status,
        reviewed: proof.reviewed || false,
        rejected: proof.rejected || false,
        decisionNote: proof.decisionNote || '',
        approvedById: proof.approvedById,
      };

      this.logger.log(`[getManualProofDetails] تم جلب تفاصيل طلب التحويل: ${proofId}`);
      return safeProof;
    } catch (err: unknown) {
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
    @Body() body?: { approvedById?: string }
  ): Promise<{ message: string }> {
    try {
      this.logger.log(`[approveProof] محاولة قبول طلب التحويل: ${proofId}`);
      
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

      const result = await this.paymentService.approveProof(
        proofId, 
        body?.approvedById
      );
      
      this.logger.log(`[approveProof] تم قبول الطلب بنجاح: ${proofId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[approveProof] فشل قبول الطلب ${proofId}: ${errorMessage}`);
      
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
      this.logger.log(`[rejectProof] محاولة رفض طلب التحويل: ${proofId}`);
      
      const proof = await this.proofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) {
        throw new NotFoundException('الطلب غير موجود');
      }

      if (!body.reason || body.reason.trim().length === 0) {
        throw new BadRequestException('سبب الرفض مطلوب');
      }

      const result = await this.paymentService.rejectProof(proofId, body.reason);
      
      this.logger.log(`[rejectProof] تم رفض الطلب بنجاح: ${proofId}`);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[rejectProof] فشل رفض الطلب ${proofId}: ${errorMessage}`);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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
      
      this.logger.log(`[getPendingProofsCount] عدد الطلبات المعلقة: ${count}`);
      return { count };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getPendingProofsCount] فشل جلب عدد الطلبات المعلقة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب عدد الطلبات المعلقة');
    }
  }

  @Get('proofs/stats')
  @ApiOperation({ summary: 'إحصائيات طلبات التحويل البنكي' })
  @ApiResponse({ status: 200, description: 'تم جلب الإحصائيات بنجاح' })
  async getProofsStats(): Promise<ProofStats> {
    try {
      const [pending, approved, rejected] = await Promise.all([
        this.proofRepo.count({ where: { status: PaymentProofStatus.PENDING } }),
        this.proofRepo.count({ where: { status: PaymentProofStatus.APPROVED } }),
        this.proofRepo.count({ where: { status: PaymentProofStatus.REJECTED } }),
      ]);

      const total = pending + approved + rejected;

      return {
        pending,
        approved,
        rejected,
        total,
        stats: {
          pendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
          approvedPercentage: total > 0 ? Math.round((approved / total) * 100) : 0,
          rejectedPercentage: total > 0 ? Math.round((rejected / total) * 100) : 0,
        }
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getProofsStats] فشل جلب إحصائيات الطلبات: ${errorMessage}`);
      throw new InternalServerErrorException('فشل جلب إحصائيات الطلبات');
    }
  }

  @Get('manual-proofs/filtered')
  @ApiOperation({ summary: 'فلتر طلبات التحويل البنكي بمجموعة معايير' })
  @ApiQuery({ name: 'status', required: false, enum: PaymentProofStatus, description: 'فلتر حسب الحالة' })
  @ApiQuery({ name: 'companyId', required: false, description: 'فلتر حسب الشركة' })
  @ApiQuery({ name: 'planId', required: false, description: 'فلتر حسب الخطة' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'من تاريخ (YYYY-MM-DD)' })
  @ApiQuery({ name: 'toDate', required: false, description: 'إلى تاريخ (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'تم جلب الطلبات بنجاح' })
  async getFilteredManualProofs(
    @Query('status') status?: PaymentProofStatus,
    @Query('companyId') companyId?: string,
    @Query('planId') planId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<ProofResponse[]> {
    try {
      const queryBuilder = this.proofRepo
        .createQueryBuilder('proof')
        .leftJoinAndSelect('proof.company', 'company')
        .leftJoinAndSelect('proof.plan', 'plan')
        .orderBy('proof.createdAt', 'DESC');

      if (status) {
        queryBuilder.andWhere('proof.status = :status', { status });
      }
      
      if (companyId) {
        queryBuilder.andWhere('company.id = :companyId', { companyId });
      }
      
      if (planId) {
        queryBuilder.andWhere('plan.id = :planId', { planId });
      }
      
      if (fromDate) {
        queryBuilder.andWhere('DATE(proof.createdAt) >= :fromDate', { fromDate });
      }
      
      if (toDate) {
        queryBuilder.andWhere('DATE(proof.createdAt) <= :toDate', { toDate });
      }

      const proofs = await queryBuilder.getMany();

      const safeProofs: ProofResponse[] = proofs.map((proof) => ({
        id: proof.id,
        companyId: proof.company?.id || 'غير معروف',
        companyName: proof.company?.name || 'شركة غير معروفة',
        companyEmail: proof.company?.email || 'بريد غير معروف',
        planId: proof.plan?.id || 'غير معروف',
        planName: proof.plan?.name || 'خطة غير معروفة',
        imageUrl: proof.imageUrl,
        publicId: proof.publicId,
        createdAt: proof.createdAt,
        status: proof.status,
        reviewed: proof.reviewed || false,
        rejected: proof.rejected || false,
        decisionNote: proof.decisionNote || '',
        approvedById: proof.approvedById,
      }));

      this.logger.log(`[getFilteredManualProofs] تم جلب ${safeProofs.length} طلب تحويل بنكي`);
      return safeProofs;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`[getFilteredManualProofs] فشل تحميل الطلبات: ${errorMessage}`);
      throw new InternalServerErrorException('فشل تحميل الطلبات');
    }
  }
}