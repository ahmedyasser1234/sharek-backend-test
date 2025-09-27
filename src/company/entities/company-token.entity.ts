import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Company } from './company.entity';

@Entity()
export class CompanyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

 @Column('text', { nullable: true })
refreshToken: string;

  @ManyToOne(() => Company, (company) => company.tokens, { onDelete: 'CASCADE' })
  company: Company;
}
