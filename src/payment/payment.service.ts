import { Injectable } from '@nestjs/common';
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

type PaymentProvider =
  | 'stripe'
  | 'hyperpay'
  | 'paytabs'
  | 'tap'
  | 'stcpay'
  | 'geidea';

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
  ) {}

  async createPlan(provider: PaymentProvider, plan: Plan): Promise<string> {
    const payload = {
      name: plan.name,
      price: Number(plan.price),
      currency: plan.currency || 'SAR',
      interval: plan.durationInDays >= 365 ? 'year' : 'month',
    };

    switch (provider) {
      case 'stripe':
        return this.stripe.createPlan(payload);
      case 'hyperpay':
        return this.hyperpay.createPlan(payload);
      case 'paytabs':
        return this.paytabs.createPlan(payload);
      case 'tap':
        return this.tap.createPlan(payload);
      case 'geidea':
        return this.geidea.createPlan(payload);
      case 'stcpay':
        return this.stcpay.createPlan(payload);
      default:
        throw new Error(`❌ بوابة الدفع غير مدعومة: ${String(provider)}`);
    }
  }

  updatePrice(provider: PaymentProvider): void {
    switch (provider) {
      case 'stripe':
        this.stripe.updatePrice();
        break;
      case 'hyperpay':
        this.hyperpay.updatePrice();
        break;
      case 'paytabs':
        this.paytabs.updatePrice();
        break;
      case 'tap':
        this.tap.updatePrice();
        break;
      case 'geidea':
        this.geidea.updatePrice();
        break;
      case 'stcpay':
        this.stcpay.updatePrice();
        break;
      default:
        throw new Error(`❌ بوابة الدفع غير مدعومة: ${String(provider)}`);
    }
  }

  async generateCheckoutUrl(
    provider: PaymentProvider,
    plan: Plan,
    companyId: string,
  ): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new Error(`❌ الشركة غير موجودة: ${companyId}`);

   let checkoutUrl: string;
switch (provider) {
  case 'stripe':
    checkoutUrl = await this.stripe.generateCheckoutUrl(plan.stripePriceId ?? '', companyId);
    break;
  case 'hyperpay':
    checkoutUrl = await this.hyperpay.generateCheckoutUrl(plan.id, companyId);
    break;
  case 'paytabs':
    checkoutUrl = await this.paytabs.generateCheckoutUrl(plan.id, companyId);
    break;
  case 'tap':
    checkoutUrl = await this.tap.generateCheckoutUrl(plan.id, companyId);
    break;
  case 'geidea':
    checkoutUrl = await this.geidea.generateCheckoutUrl(plan.id, companyId);
    break;
  case 'stcpay':
    checkoutUrl = this.stcpay.generateCheckoutUrl(plan.id, companyId);
    break;
  default:
    throw new Error(`❌ بوابة الدفع غير مدعومة: ${String(provider)}`);
}


    const transaction = this.transactionRepo.create({
      company,
      plan,
      amount: Number(plan.price),
      currency: plan.currency || 'SAR',
      provider: String(provider),
      status: 'pending',
    });

    await this.transactionRepo.save(transaction);
    return checkoutUrl;
  }
}
