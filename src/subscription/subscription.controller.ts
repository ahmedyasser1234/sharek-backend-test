import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CompanyService } from '../company/company.service';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Subscription')
@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

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

  @Post('company/:id/subscribe/:planId')
  @ApiOperation({ summary: 'اشتراك شركة في خطة معينة' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiParam({ name: 'planId', description: 'معرف الخطة' })
  @ApiResponse({ status: 201, description: 'تم الاشتراك بنجاح' })
  subscribe(
    @Param('id') companyId: string,
    @Param('planId') planId: string,
  ) {
    this.logger.log(`📝 اشتراك الشركة ${companyId} في الخطة ${planId}`);
    return this.subscriptionService.subscribe(companyId, planId);
  }

  @Get('company/:id/subscription')
  @ApiOperation({ summary: 'جلب اشتراك الشركة الحالي' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب الاشتراك بنجاح' })
  getCompanySubscription(@Param('id') companyId: string) {
    this.logger.log(`📄 جلب اشتراك الشركة الحالي: ${companyId}`);
    return this.subscriptionService.getCompanySubscription(companyId);
  }

  @Get('company/:id/usage')
  @ApiOperation({ summary: 'جلب استخدام الشركة الحالي من الاشتراك' })
  @ApiParam({ name: 'id', description: 'معرف الشركة' })
  @ApiResponse({ status: 200, description: 'تم جلب الاستخدام بنجاح' })
  async getUsage(@Param('id') companyId: string): Promise<any> {
    this.logger.debug(`📊 حساب استخدام الشركة: ${companyId}`);

    const subscription = await this.subscriptionService.getCompanySubscription(companyId);
    const allowed: number = subscription?.plan?.maxEmployees || 0;
    const current: number = await this.companyService.countEmployees(companyId);

    const now = new Date();
    const isExpired: boolean = subscription ? new Date(subscription.endDate) < now : true;
    this.logger.log(`✅ الشركة ${companyId} تستخدم ${current}/${allowed} موظف | منتهي: ${isExpired}`);

    return {
      allowed,
      current,
      remaining: allowed - current,
      currentSubscription: subscription,
      isExpired,
    };
  }
}
