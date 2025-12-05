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
import { Manager } from '../../admin/entities/manager.entity';
import { Admin } from '../../admin/entities/admin.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive', 
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

@Entity('company_subscriptions')
export class CompanySubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (company) => company.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ nullable: true })
  companyId: string;

  @ManyToOne(() => Plan, (plan) => plan.subscriptions, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column()
  planId: string;

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

  @Column({ nullable: true, comment: 'معرف البائع الذي فعل الاشتراك' })
  activatedBySellerId?: string;

  @Column({ nullable: true, comment: 'معرف الأدمن الذي فعل الاشتراك' })
  activatedByAdminId?: string;

  @ManyToOne(() => Manager, (manager) => manager.activatedSubscriptions, { 
    nullable: true 
  })
  @JoinColumn({ name: 'activatedBySellerId' })
  activatedBySeller: Manager | null;

  @ManyToOne(() => Admin, (admin) => admin.activatedSubscriptions, { 
    nullable: true 
  })
  @JoinColumn({ name: 'activatedByAdminId' })
  activatedByAdmin: Admin | null;
}