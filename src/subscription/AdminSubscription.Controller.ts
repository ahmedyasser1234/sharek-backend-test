import {
  Controller,
  Get,
  Patch,
  Param,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CompanyService } from '../company/company.service';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
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
  getPlans() {
    this.logger.log('📦 جلب جميع الخطط المتاحة');
    return this.subscriptionService.getPlans();
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'إلغاء اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم إلغاء الاشتراك بنجاح' })
  cancelSubscription(@Param('id') companyId: string) {
    this.logger.warn(`🛑 إلغاء اشتراك الشركة ${companyId}`);
    return this.subscriptionService.cancelSubscription(companyId);
  }

  @Patch(':id/extend')
  @ApiOperation({ summary: 'تمديد اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم تمديد الاشتراك بنجاح' })
  extendSubscription(@Param('id') companyId: string) {
    this.logger.log(`⏳ تمديد اشتراك الشركة ${companyId}`);
    return this.subscriptionService.extendSubscription(companyId);
  }

  @Patch(':id/change-plan/:newPlanId')
  @ApiOperation({ summary: 'تغيير خطة اشتراك الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'newPlanId', description: 'معرف الخطة الجديدة' })
  @ApiResponse({ status: 200, description: 'تم تغيير الخطة بنجاح' })
  changePlan(
    @Param('id') companyId: string,
    @Param('newPlanId') newPlanId: string,
  ) {
    this.logger.log(`🔄 تغيير خطة الشركة ${companyId} إلى ${newPlanId}`);
    return this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'عرض سجل اشتراكات الشركة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب سجل الاشتراكات بنجاح' })
  getSubscriptionHistory(@Param('id') companyId: string) {
    this.logger.log(`📜 جلب سجل اشتراكات الشركة ${companyId}`);
    return this.subscriptionService.getSubscriptionHistory(companyId);
  }
}
