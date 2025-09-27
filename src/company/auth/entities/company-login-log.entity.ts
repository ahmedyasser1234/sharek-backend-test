import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Company } from '../../entities/company.entity';

@Entity()
export class CompanyLoginLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 45 })
  ip: string;

  @Column()
  success: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @ManyToOne(() => Company, (company) => company.loginLogs, { nullable: false })
  company: Company;
}
