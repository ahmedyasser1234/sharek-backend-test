import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Company } from '../../entities/company.entity';

@Entity()
export class CompanyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('text', { nullable: false })
  refreshToken: string;

  @ManyToOne(() => Company, (company) => company.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @CreateDateColumn()
  createdAt: Date;
}
