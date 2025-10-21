import {
  Controller,
  Post,
  Body,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../plan/entities/plan.entity';
import { PaymentProvider } from './payment-provider.enum';
import { PaymentProof } from './entities/payment-proof.entity';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(PaymentProof)
    private readonly proofRepo: Repository<PaymentProof>,
  ) {}

  @Post('checkout')
  async getCheckoutUrl(
    @Body() body: { provider: PaymentProvider; planId: string; companyId: string },
  ): Promise<{ url: string }> {
    try {
      this.logger.log(`🔁 طلب إنشاء رابط دفع: الشركة ${body.companyId} - الخطة ${body.planId} - المزود ${body.provider}`);

      const plan = await this.planRepo.findOne({ where: { id: body.planId } });
      if (!plan) {
        this.logger.warn(` الخطة غير موجودة: ${body.planId}`);
        throw new NotFoundException('الخطة غير موجودة');
      }

      const url = await this.paymentService.generateCheckoutUrl(
        body.provider,
        plan,
        body.companyId,
      );

      this.logger.log(`✅ تم إنشاء رابط الدفع بنجاح: ${url}`);
      return { url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(` فشل إنشاء رابط الدفع: ${msg}`);
      if (err instanceof NotFoundException) throw err;
      throw new HttpException('فشل إنشاء رابط الدفع', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
