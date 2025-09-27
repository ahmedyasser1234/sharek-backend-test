// src/payment/payment.controller.ts
import { Controller, Post, Body, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../plan/entities/plan.entity';

type PaymentProvider = 'stripe' | 'hyperpay' | 'paytabs' | 'tap' | 'stcpay' | 'geidea';

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
    const plan = await this.planRepo.findOne({ where: { id: body.planId } });
    if (!plan) throw new NotFoundException('❌ الخطة غير موجودة');

    const url = await this.paymentService.generateCheckoutUrl(body.provider, plan, body.companyId);
    return { url };
  }
}
