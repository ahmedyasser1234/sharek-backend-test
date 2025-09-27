import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripePriceId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paypalPlanId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  saudiGatewayPlanId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentProvider?: 'stripe' | 'paypal' | 'paytabs' | 'hyperpay' | 'geidea' | 'manual';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 10, default: 'SAR' })
  currency: string;

  @Column({ nullable: true })
  hyperpayPlanId: string;

  @Column({ nullable: true })
  paytabsPlanId: string;

  @Column({ nullable: true })
  tapPlanId: string;

  @Column({ nullable: true })
  stcpayPlanId: string;

  @Column({ nullable: true })
  geideaPlanId: string;

}
