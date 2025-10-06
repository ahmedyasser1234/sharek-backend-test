import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity()
export class CompanyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { nullable: false })
  refreshToken: string;

  @ManyToOne(() => Company, (company) => company.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' }) // ✅ ضروري لربط المفتاح فعليًا
  company: Company;
}
