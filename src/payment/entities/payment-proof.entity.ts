import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Plan } from '../../plan/entities/plan.entity';

@Entity()
export class PaymentProof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true }) 
  publicId: string;

  // ✅ أضف onDelete: 'CASCADE' هنا
  @ManyToOne(() => Company, { 
    eager: true,
    onDelete: 'CASCADE' // ✅ هذا هو الحل الأساسي
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
}