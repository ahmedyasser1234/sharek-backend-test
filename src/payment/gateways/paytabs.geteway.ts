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
  private readonly callbackUrl = process.env.PAYTABS_CALLBACK_URL ?? 'https://yourdomain.com/paytabs/callback';
  private readonly returnUrl = process.env.PAYTABS_RETURN_URL ?? 'https://yourdomain.com/success';

  createPlan(plan: { name: string; price: number }): string {
    return `${plan.name}-paytabs-${Date.now()}`;
  }

  updatePrice(): void {}

  async generateCheckoutUrl(planId: string, companyId: string): Promise<string> {
    const externalTransactionId = `${companyId}-${Date.now()}`;

    const response: AxiosResponse<PayTabsResponse> = await axios.post(this.baseUrl, {
      profile_id: this.profileId,
      tran_type: 'sale',
      tran_class: 'ecom',
      cart_id: externalTransactionId,
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
      callback: this.callbackUrl,
      return: this.returnUrl,
    }, {
      headers: {
        authorization: this.serverKey,
        'Content-Type': 'application/json',
      },
    });

    return response.data.redirect_url;
  }
}
