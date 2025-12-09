// src/subscription/entities/company-subscription.entity.ts
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
import { Supadmin } from '../../admin/entities/supadmin.entity';

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

  @Column({ nullable: true, comment: 'معرف المسؤول الأعلى الذي فعل الاشتراك' })
  activatedBySupadminId?: string;

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

  @ManyToOne(() => Supadmin, (supadmin) => supadmin.activatedSubscriptions, { 
    nullable: true 
  })
  @JoinColumn({ name: 'activatedBySupadminId' })
  activatedBySupadmin: Supadmin | null;

  @Column({ type: 'int', nullable: true })
  maxEmployees: number;

  isActive(): boolean {
    return this.status === SubscriptionStatus.ACTIVE;
  }

  isExpired(): boolean {
    if (!this.endDate) return false;
    return new Date() > this.endDate && this.status !== SubscriptionStatus.CANCELLED;
  }

  daysRemaining(): number {
    if (!this.endDate || this.status !== SubscriptionStatus.ACTIVE) return 0;
    const now = new Date();
    const end = new Date(this.endDate);
    const diffTime = end.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getActivatedByInfo(): string {
    if (this.activatedBySupadmin) {
      return `${this.activatedBySupadmin.email} (مسؤول أعلى)`;
    } else if (this.activatedByAdmin) {
      return `${this.activatedByAdmin.email} (أدمن)`;
    } else if (this.activatedBySeller) {
      return `${this.activatedBySeller.email} (بائع)`;
    }
    return 'غير معروف';
  }
}