import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Company } from '../../entities/company.entity';

@Entity()
export class CompanyLoginLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 45, nullable: false, default: 'unknown' })
  ip: string;

  @Column({ default: true })
  success: boolean;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ nullable: false })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.loginLogs, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'text', default: 'unknown' })
  action: string;
}
