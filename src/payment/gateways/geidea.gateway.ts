import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface GeideaCheckoutResponse {
  checkoutUrl: string;
}

@Injectable()
export class GeideaGateway {
  private readonly baseUrl = 'https://api.geidea.net';
  private readonly apiKey = process.env.GEIDEA_API_KEY!;
  private readonly callbackUrl =
    process.env.GEIDEA_CALLBACK_URL ?? 'https://yourdomain.com/geidea/callback';

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-geidea-${Date.now()}`;
  }

  updatePrice(): void {}

  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const amount = planId.includes('99') ? 99 : 59;
    const externalTransactionId = `${companyId}-${Date.now()}`; 

    const response: AxiosResponse<GeideaCheckoutResponse> = await axios.post(
      `${this.baseUrl}/payment/checkout`,
      {
        amount,
        currency: 'SAR',
        callbackUrl: this.callbackUrl,
        customer: {
          name: 'Ahmed',
          email: 'ahmed@example.com',
          phone: '966500000000',
        },
        reference: externalTransactionId, 
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.checkoutUrl;
  }
}
