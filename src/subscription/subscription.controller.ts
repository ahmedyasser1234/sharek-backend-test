import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CompanyService } from '../company/company.service';
import { CompanySubscription } from './entities/company-subscription.entity';
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
  async getPlans(): Promise<ReturnType<SubscriptionService['getPlans']>> {
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
  ): Promise<ReturnType<SubscriptionService['subscribe']>> {
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
  ): Promise<ReturnType<SubscriptionService['getCompanySubscription']>> {
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
}
