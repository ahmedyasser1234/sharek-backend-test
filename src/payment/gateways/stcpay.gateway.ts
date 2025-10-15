import { Injectable } from '@nestjs/common';

@Injectable()
export class STCPayGateway {
  private readonly callbackUrl = process.env.STCPAY_CALLBACK_URL ?? 'https://yourdomain.com/stcpay/callback';

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-stcpay-${Date.now()}`;
  }

  updatePrice(): void {}

  generateCheckoutUrl(planId: string, companyId: string): string {
    return `${this.callbackUrl}?plan=${planId}&company=${companyId}`;
  }
}
