import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Company } from '../../entities/company.entity';

@Entity()
export class CompanyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  refreshToken: string;

  @ManyToOne(() => Company, (company) => company.tokens, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  company: Company;
}
