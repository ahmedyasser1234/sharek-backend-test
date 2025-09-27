import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface GeideaCheckoutResponse {
  checkoutUrl: string;
}

@Injectable()
export class GeideaGateway {
  private readonly baseUrl = 'https://api.geidea.net';
  private readonly apiKey = process.env.GEIDEA_API_KEY!;

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-geidea-${Date.now()}`;
  }

  updatePrice(): void {
  
  }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const amount = planId.includes('99') ? 99 : 59;

    const response: AxiosResponse<GeideaCheckoutResponse> = await axios.post(
      `${this.baseUrl}/payment/checkout`,
      {
        amount,
        currency: 'SAR',
        callbackUrl: `https://yourdomain.com/geidea/callback`,
        customer: {
          name: 'Ahmed',
          email: 'ahmed@example.com',
          phone: '966500000000',
        },
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
