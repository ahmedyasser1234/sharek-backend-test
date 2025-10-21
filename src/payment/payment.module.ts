import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { StripeGateway } from './gateways/stripe.gateway';
import { HyperPayGateway } from './gateways/hyperpay.gateway';
import { PayTabsGateway } from './gateways/paytabs.geteway';
import { TapGateway } from './gateways/tap.gateway';
import { STCPayGateway } from './gateways/stcpay.gateway';
import { GeideaGateway } from './gateways/geidea.gateway';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { CompanySubscription } from '../subscription/entities/company-subscription.entity'; 
import { WebhookController } from './webhook.controller';
import { PaymentController } from './payment.controller';
import { PlanModule } from '../plan/plan.module';
import { PaymentProof } from './entities/payment-proof.entity';
import { CloudinaryModule } from '../common/services/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      Company,
      CompanySubscription, 
      PaymentProof,
    ]),
    CloudinaryModule,
    PlanModule,
  ],
  providers: [
    PaymentService,
    StripeGateway,
    HyperPayGateway,
    PayTabsGateway,
    TapGateway,
    STCPayGateway,
    GeideaGateway,
    
  ],
  exports: [PaymentService],
  controllers: [WebhookController, PaymentController],
})
export class PaymentModule {}
