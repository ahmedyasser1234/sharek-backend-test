import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentService } from './payment.service';

interface StripeEvent {
  id: string;
  object: string;
}

interface StripeWebhookEvent {
  type: string;
  data: {
    object: StripeEvent;
  };
}

interface HyperPayTransaction {
  id: string;
  status: string;
}

interface PayTabsResult {
  response_status: string;
}

interface PayTabsWebhookBody {
  transaction_id: string;
  payment_result: PayTabsResult;
}

interface TapWebhookBody {
  id: string;
  status: string;
}

interface GeideaWebhookBody {
  orderId: string;
  status: string;
}

interface STCPayTransaction {
  id: string;
  status: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly stripe: Stripe;

  constructor(private readonly paymentService: PaymentService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    });
  }

  @Post('stripe')
  async handleStripe(@Body() body: unknown, @Headers('stripe-signature') signature: string): Promise<void> {
    try {
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
      const rawBody = JSON.stringify(body);
      const event: StripeWebhookEvent = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        endpointSecret
      ) as StripeWebhookEvent;

      if (event.type === 'checkout.session.completed') {
        const sessionId = event.data.object.id;
        this.logger.log(`✅ Stripe دفع ناجح: ${sessionId}`);
        await this.paymentService.confirmTransaction(sessionId);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Stripe Webhook فشل: ${errorMessage}`);
    }
  }

  @Post('hyperpay')
  async handleHyperPay(@Body() body: { transaction: HyperPayTransaction }): Promise<void> {
    const { transaction } = body;
    if (transaction?.status === 'SUCCESS') {
      this.logger.log(`✅ HyperPay دفع ناجح: ${transaction.id}`);
      await this.paymentService.confirmTransaction(transaction.id);
    } else {
      this.logger.warn(`❌ HyperPay دفع فشل: ${transaction?.status}`);
    }
  }

  @Post('paytabs')
  async handlePayTabs(@Body() body: PayTabsWebhookBody): Promise<void> {
    const { payment_result, transaction_id } = body;
    if (payment_result?.response_status === 'A') {
      this.logger.log(`✅ PayTabs دفع ناجح: ${transaction_id}`);
      await this.paymentService.confirmTransaction(transaction_id);
    } else {
      this.logger.warn(`❌ PayTabs دفع فشل: ${payment_result?.response_status}`);
    }
  }

  @Post('tap')
  async handleTap(@Body() body: TapWebhookBody): Promise<void> {
    if (body.status === 'CAPTURED') {
      this.logger.log(`✅ Tap دفع ناجح: ${body.id}`);
      await this.paymentService.confirmTransaction(body.id);
    } else {
      this.logger.warn(`❌ Tap دفع فشل: ${body.status}`);
    }
  }

  @Post('geidea')
  async handleGeidea(@Body() body: GeideaWebhookBody): Promise<void> {
    if (body.status === 'PAID') {
      this.logger.log(`✅ Geidea دفع ناجح: ${body.orderId}`);
      await this.paymentService.confirmTransaction(body.orderId);
    } else {
      this.logger.warn(`❌ Geidea دفع فشل: ${body.status}`);
    }
  }

  @Post('stcpay')
  async handleSTCPay(@Body() body: { transaction: STCPayTransaction }): Promise<void> {
    const { transaction } = body;
    if (transaction?.status === 'SUCCESS') {
      this.logger.log(`✅ STC Pay دفع ناجح: ${transaction.id}`);
      await this.paymentService.confirmTransaction(transaction.id);
    } else {
      this.logger.warn(`❌ STC Pay دفع فشل: ${transaction?.status}`);
    }
  }
}
