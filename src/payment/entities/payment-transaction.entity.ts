import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';
import { PaymentProvider } from '../payment-provider.enum';

export type TransactionStatus = 'success' | 'failed' | 'pending';

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => Plan, { nullable: true})
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @OneToOne(() => CompanySubscription, (sub) => sub.paymentTransaction, {
    nullable: true,
  })
  @JoinColumn({ name: 'subscriptionId' })
  subscription?: CompanySubscription;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'enum', enum: PaymentProvider })
  provider: PaymentProvider;

  @Column({ type: 'varchar', length: 20 })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalTransactionId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
