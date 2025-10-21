import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { PaymentTransaction } from '../../payment/entities/payment-transaction.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PENDING = 'pending',
}

@Entity('company_subscriptions')
export class CompanySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (company) => company.subscriptions, {
    onDelete: 'CASCADE',
  })
  company: Company;

  @ManyToOne(() => Plan, (plan) => plan.subscriptions, {
    onDelete: 'CASCADE',
  })
  plan: Plan;

  @Column({ type: 'timestamp', comment: 'تاريخ بدء الاشتراك' })
  startDate: Date;

  @Column({ type: 'timestamp', comment: 'تاريخ انتهاء الاشتراك' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: 'سعر الاشتراك' })
  price: number;

  @Column({ type: 'varchar', length: 10, default: 'SAR', comment: 'عملة الاشتراك' })
  currency: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING,
    comment: 'حالة الاشتراك',
  })
  status: SubscriptionStatus;

  @OneToOne(() => PaymentTransaction, (pt) => pt.subscription, {
    nullable: true,
    cascade: true,
  })
  @JoinColumn({ name: 'paymentTransactionId' })
  paymentTransaction?: PaymentTransaction;

  @CreateDateColumn({ comment: 'تاريخ الإنشاء' })
  createdAt: Date;

  @UpdateDateColumn({ comment: 'تاريخ آخر تعديل' })
  updatedAt: Date;

  @Column({ type: 'int', nullable: true })
  customMaxEmployees?: number;

}
