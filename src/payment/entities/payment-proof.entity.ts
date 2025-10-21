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

  @ManyToOne(() => Company, { eager: true })
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
