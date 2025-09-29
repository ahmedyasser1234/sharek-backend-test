import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';
import { PaymentProvider } from '../../payment/payment-provider.enum';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'int' })
  maxEmployees: number;

  @Column({ type: 'int' })
  durationInDays: number;

  @Column({ default: false })
  isTrial: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: PaymentProvider, nullable: true })
  paymentProvider?: PaymentProvider;

  @Column({ type: 'varchar', length: 10, default: 'SAR' })
  currency: string;

  @Column({ nullable: true })
  stripePriceId?: string;

  @Column({ nullable: true })
  paypalPlanId?: string;

  @Column({ nullable: true })
  saudiGatewayPlanId?: string;

  @Column({ nullable: true })
  hyperpayPlanId?: string;

  @Column({ nullable: true })
  paytabsPlanId?: string;

  @Column({ nullable: true })
  tapPlanId?: string;

  @Column({ nullable: true })
  stcpayPlanId?: string;

  @Column({ nullable: true })
  geideaPlanId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CompanySubscription, (sub) => sub.plan)
  subscriptions: CompanySubscription[];
}
