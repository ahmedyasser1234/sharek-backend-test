import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { PaymentProofStatus } from './payment-proof-status.enum';

@Entity('payment_proofs')
export class PaymentProof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true }) 
  publicId: string;

  @ManyToOne(() => Company, { 
    eager: true,
    onDelete: 'CASCADE'
  })
  company: Company;

  @ManyToOne(() => Plan, { eager: true })
  plan: Plan;

  @Column()
  imageUrl: string;

  @Column({ default: false })
  reviewed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  rejected: boolean;

  @Column({ nullable: true })
  decisionNote: string;

  @Column({
    type: 'enum',
    enum: PaymentProofStatus,
    default: PaymentProofStatus.PENDING
  })
  status: PaymentProofStatus;
}