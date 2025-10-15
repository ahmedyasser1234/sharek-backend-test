import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface HyperPayCheckoutResponse {
  id: string;
}

@Injectable()
export class HyperPayGateway {
  private readonly baseUrl = 'https://test.oppwa.com';
  private readonly entityId = process.env.HYPERPAY_ENTITY_ID!;
  private readonly auth = `Bearer ${process.env.HYPERPAY_API_KEY!}`;

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-hyperpay-${Date.now()}`;
  }

  updatePrice(): void {}

  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const amount = planId.includes('99') ? '99.00' : '59.00';
    const externalTransactionId = `${companyId}-${Date.now()}`;

    const payload = new URLSearchParams({
      entityId: this.entityId,
      amount,
      currency: 'SAR',
      paymentType: 'DB',
      merchantTransactionId: externalTransactionId,
    });

    const response: AxiosResponse<HyperPayCheckoutResponse> = await axios.post(
      `${this.baseUrl}/v1/checkouts`,
      payload,
      {
        headers: { Authorization: this.auth },
      }
    );

    return `${this.baseUrl}/v1/paymentWidgets.js?checkoutId=${response.data.id}`;
  }
}
