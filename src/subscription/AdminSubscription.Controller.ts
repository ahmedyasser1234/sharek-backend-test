import {
  Controller,
  Get,
  Patch,
  Param,
  Logger,
  UseGuards,
  InternalServerErrorException,
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
  async getPlans(): Promise<ReturnType<SubscriptionService['getPlans']>> {
    try {
      return await this.subscriptionService.getPlans();
    } catch (error: unknown) {
      this.logger.error(' فشل جلب الخطط', error as any);
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
      this.logger.error(` فشل إلغاء الاشتراك للشركة ${companyId}`, error as any);
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
      this.logger.error(` فشل تمديد الاشتراك للشركة ${companyId}`, error as any);
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
      this.logger.error(` فشل تغيير الخطة للشركة ${companyId}`, error as any);
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
      this.logger.error(` فشل جلب سجل الاشتراكات للشركة ${companyId}`, error as any);
      throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
    }
  }
}
