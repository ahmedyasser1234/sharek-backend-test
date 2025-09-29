import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface TapResponse {
  transaction: {
    url: string;
  };
}

@Injectable()
export class TapGateway {
  private readonly baseUrl = 'https://api.tap.company/v2';
  private readonly apiKey = process.env.TAP_API_KEY!;
  private readonly callbackUrl = process.env.TAP_CALLBACK_URL ?? 'https://yourdomain.com/tap/callback';

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-tap-${Date.now()}`;
  }

  updatePrice(): void {}

  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const externalTransactionId = `${companyId}-${Date.now()}`;
    const amount = planId.includes('99') ? 99 : 59;

    const response: AxiosResponse<TapResponse> = await axios.post(`${this.baseUrl}/charges`, {
      amount,
      currency: 'SAR',
      customer: {
        first_name: 'Ahmed',
        email: 'ahmed@example.com',
        phone: { country_code: '966', number: '500000000' },
      },
      redirect: {
        url: this.callbackUrl,
      },
      reference: {
        transaction: externalTransactionId,
      },
      source: { id: 'src_all' },
    }, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data.transaction.url;
  }
}
