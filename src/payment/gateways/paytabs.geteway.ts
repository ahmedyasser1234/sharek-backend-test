// src/payment/gateways/paytabs.gateway.ts
import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface PayTabsResponse {
  redirect_url: string;
}

@Injectable()
export class PayTabsGateway {
  private readonly baseUrl = 'https://secure.paytabs.com/payment/request';
  private readonly serverKey = process.env.PAYTABS_SERVER_KEY!;
  private readonly profileId = process.env.PAYTABS_PROFILE_ID!;

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-paytabs-${Date.now()}`;
  }

  updatePrice(): void {
  }

  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const response: AxiosResponse<PayTabsResponse> = await axios.post(this.baseUrl, {
      profile_id: this.profileId,
      tran_type: 'sale',
      tran_class: 'ecom',
      cart_id: `${companyId}-${Date.now()}`,
      cart_description: 'اشتراك في خطة',
      cart_currency: 'SAR',
      cart_amount: planId.includes('99') ? 99.0 : 59.0,
      customer_details: {
        name: 'Ahmed',
        email: 'ahmed@example.com',
        phone: '966500000000',
        street: 'Riyadh',
        city: 'Riyadh',
        country: 'SA',
        state: 'Riyadh',
        zip: '12345',
      },
      callback: 'https://yourdomain.com/paytabs/callback',
      return: 'https://yourdomain.com/success',
    }, {
      headers: {
        authorization: this.serverKey,
        'Content-Type': 'application/json',
      },
    });

    return response.data.redirect_url;
  }
}
