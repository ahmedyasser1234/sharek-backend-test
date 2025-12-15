import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
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
        await this.paymentService.confirmTransaction(sessionId);
      }
    } catch (err) {
      throw new HttpException(
        `Stripe Webhook فشل: ${err instanceof Error ? err.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('hyperpay')
  async handleHyperPay(@Body() body: { transaction: HyperPayTransaction }): Promise<void> {
    try {
      const { transaction } = body;
      if (transaction?.status === 'SUCCESS') {
        await this.paymentService.confirmTransaction(transaction.id);
      } else {
        throw new HttpException(`HyperPay دفع فشل: ${transaction?.status}`, HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) {
        throw new HttpException('فشل معالجة HyperPay webhook', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw err;
    }
  }

  @Post('paytabs')
  async handlePayTabs(@Body() body: PayTabsWebhookBody): Promise<void> {
    try {
      const { payment_result, transaction_id } = body;
      if (payment_result?.response_status === 'A') {
        await this.paymentService.confirmTransaction(transaction_id);
      } else {
        throw new HttpException(`PayTabs دفع فشل: ${payment_result?.response_status}`, HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) {
        throw new HttpException('فشل معالجة PayTabs webhook', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw err;
    }
  }

  @Post('tap')
  async handleTap(@Body() body: TapWebhookBody): Promise<void> {
    try {
      if (body.status === 'CAPTURED') {
        await this.paymentService.confirmTransaction(body.id);
      } else {
        throw new HttpException(`Tap دفع فشل: ${body.status}`, HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) {
        throw new HttpException('فشل معالجة Tap webhook', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw err;
    }
  }

  @Post('geidea')
  async handleGeidea(@Body() body: GeideaWebhookBody): Promise<void> {
    try {
      if (body.status === 'PAID') {
        await this.paymentService.confirmTransaction(body.orderId);
      } else {
        throw new HttpException(`Geidea دفع فشل: ${body.status}`, HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) {
        throw new HttpException('فشل معالجة Geidea webhook', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw err;
    }
  }

  @Post('stcpay')
  async handleSTCPay(@Body() body: { transaction: STCPayTransaction }): Promise<void> {
    try {
      const { transaction } = body;
      if (transaction?.status === 'SUCCESS') {
        await this.paymentService.confirmTransaction(transaction.id);
      } else {
        throw new HttpException(`STC Pay دفع فشل: ${transaction?.status}`, HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) {
        throw new HttpException('فشل معالجة STC Pay webhook', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      throw err;
    }
  }
}