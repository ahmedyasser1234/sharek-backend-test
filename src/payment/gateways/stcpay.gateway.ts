import { Injectable } from '@nestjs/common';

@Injectable()
export class STCPayGateway {
  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-stcpay-${Date.now()}`;
  }

  updatePrice(): void {
  }

  generateCheckoutUrl(planId: string, companyId: string): string {
    return `https://yourdomain.com/stcpay/checkout?plan=${planId}&company=${companyId}`;
  }
}
