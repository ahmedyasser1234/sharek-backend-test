import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeGateway {
  private readonly stripe: Stripe;
  private readonly successUrl = process.env.STRIPE_SUCCESS_URL ?? 'https://yourdomain.com/success';
  private readonly cancelUrl = process.env.STRIPE_CANCEL_URL ?? 'https://yourdomain.com/cancel';

  constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
    this.stripe = new Stripe(stripeKey);
  }

  async createPlan(plan: { name: string; price: number }): Promise<string> {
    const product = await this.stripe.products.create({ name: plan.name });

    const price = await this.stripe.prices.create({
      unit_amount: Math.round(plan.price * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      product: product.id,
    });

    return price.id;
  }

  updatePrice(): void {}

  async generateCheckoutUrl(priceId: string, companyId: string): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.successUrl}?company=${encodeURIComponent(companyId)}`,
      cancel_url: this.cancelUrl,
    });

    return session.url ?? '';
  }
}
