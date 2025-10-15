import { Controller, Post, Body, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../plan/entities/plan.entity';
import { PaymentProvider } from './payment-provider.enum';

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  @Post('checkout')
  async getCheckoutUrl(
    @Body() body: { provider: PaymentProvider; planId: string; companyId: string },
  ): Promise<{ url: string }> {
    try {
      const plan = await this.planRepo.findOne({ where: { id: body.planId } });
      if (!plan) throw new NotFoundException(' الخطة غير موجودة');

      const url = await this.paymentService.generateCheckoutUrl(body.provider, plan, body.companyId);
      return { url };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل إنشاء رابط الدفع', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
