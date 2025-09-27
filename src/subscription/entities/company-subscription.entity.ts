import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { PaymentTransaction } from '../../payment/entities/payment-transaction.entity';

@Entity('company_subscriptions')
export class CompanySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { eager: true, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => Plan, { eager: true, nullable: false })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

 @OneToOne(() => PaymentTransaction, (tx) => tx.subscription, {
  nullable: true,
  cascade: true,
})
@JoinColumn({ name: 'paymentTransactionId' })
paymentTransaction?: PaymentTransaction;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
