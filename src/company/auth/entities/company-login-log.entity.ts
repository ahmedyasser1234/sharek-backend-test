import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Company } from '../../entities/company.entity';

@Entity()
@Unique(['companyId']) // ✅ علشان نقدر نعمل upsert على أساس الشركة
export class CompanyLoginLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 45, nullable: false, default: 'unknown' })
  ip: string;

  @Column({ default: true })
  success: boolean;

  @UpdateDateColumn()
  timestamp: Date;

  @Column({ nullable: false })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.loginLogs, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'text', default: 'unknown' })
  action: string;
}
