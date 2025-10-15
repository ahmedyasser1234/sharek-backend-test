import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StripeGateway } from './gateways/stripe.gateway';
import { HyperPayGateway } from './gateways/hyperpay.gateway';
import { PayTabsGateway } from './gateways/paytabs.geteway';
import { TapGateway } from './gateways/tap.gateway';
import { STCPayGateway } from './gateways/stcpay.gateway';
import { GeideaGateway } from './gateways/geidea.gateway';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from '../plan/entities/plan.entity';
import {
  CompanySubscription,
  SubscriptionStatus,
} from '../subscription/entities/company-subscription.entity';
import { PaymentProvider } from './payment-provider.enum';

@Injectable()
export class PaymentService {
  constructor(
    private readonly stripe: StripeGateway,
    private readonly hyperpay: HyperPayGateway,
    private readonly paytabs: PayTabsGateway,
    private readonly tap: TapGateway,
    private readonly geidea: GeideaGateway,
    private readonly stcpay: STCPayGateway,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompanySubscription)
    private readonly subRepo: Repository<CompanySubscription>,
  ) {}

  async generateCheckoutUrl(
    provider: PaymentProvider,
    plan: Plan,
    companyId: string,
  ): Promise<string> {
    try {
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (!company) throw new HttpException(` الشركة غير موجودة: ${companyId}`, HttpStatus.NOT_FOUND);

      let checkoutUrl: string;
      let externalId: string;

      switch (provider) {
        case PaymentProvider.STRIPE:
          externalId = plan.stripePriceId ?? '';
          checkoutUrl = await this.stripe.generateCheckoutUrl(externalId, companyId);
          break;
        case PaymentProvider.HYPERPAY:
          externalId = `${companyId}-${Date.now()}`;
          checkoutUrl = await this.hyperpay.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.PAYTABS:
          externalId = `${companyId}-${Date.now()}`;
          checkoutUrl = await this.paytabs.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.TAP:
          externalId = `${companyId}-${Date.now()}`;
          checkoutUrl = await this.tap.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.GEIDEA:
          externalId = `${companyId}-${Date.now()}`;
          checkoutUrl = await this.geidea.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.STCPAY:
          externalId = `${companyId}-${Date.now()}`;
          checkoutUrl = this.stcpay.generateCheckoutUrl(plan.id, companyId);
          break;
        default:
          throw new HttpException(` بوابة الدفع غير مدعومة: ${String(provider)}`, HttpStatus.BAD_REQUEST);
      }

      const transaction = this.transactionRepo.create({
        company,
        plan,
        amount: Number(plan.price),
        currency: plan.currency || 'SAR',
        provider,
        status: 'pending',
        externalTransactionId: externalId,
      });

      await this.transactionRepo.save(transaction);
      return checkoutUrl;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('فشل إنشاء رابط الدفع', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async confirmTransaction(externalTransactionId: string): Promise<void> {
    try {
      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId },
        relations: ['company', 'plan'],
      });

      if (!transaction || transaction.status === 'success') return;
      if (!transaction.plan) throw new HttpException(' الخطة غير موجودة في المعاملة', HttpStatus.NOT_FOUND);

      transaction.status = 'success';
      await this.transactionRepo.save(transaction);

      const subscription = this.subRepo.create({
        company: transaction.company,
        plan: transaction.plan,
        startDate: new Date(),
        endDate: new Date(Date.now() + transaction.plan.durationInDays * 86400000),
        price: transaction.amount,
        currency: transaction.currency,
        status: SubscriptionStatus.ACTIVE,
        paymentTransaction: transaction,
      });

      await this.subRepo.save(subscription);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('فشل تأكيد المعاملة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
