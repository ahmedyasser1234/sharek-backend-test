import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
  CreateDateColumn, 
  UpdateDateColumn 
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';
import { CompanyToken } from '../auth/entities/company-token.entity';
import { CompanyLoginLog } from '../auth/entities/company-login-log.entity';
import * as bcrypt from 'bcryptjs';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Company {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'شركة التقنية الحديثة' })
  @Column('text')
  name: string;

  @ApiProperty({ example: 'admin@company.com' })
  @Column({ unique: true, type: 'text' })
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @Column('text')
  password: string;

  @ApiProperty({ example: '01012345678' })
  @Column('text')
  phone: string;

  @ApiProperty({ example: 'https://example.com/logo.png' })
  @Column({ nullable: true, type: 'text' })
  logoUrl: string;

  @ApiProperty({ example: 'شركة متخصصة في حلول البرمجيات' })
  @Column({ nullable: true, type: 'text' })
  description: string;

  @ApiProperty({ example: true })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ example: 'admin' })
  @Column({ default: 'admin', type: 'text' })
  role: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ nullable: true, type: 'uuid' })
  defaultDesignId: string;

  @ApiProperty({ example: false })
  @Column({ default: false })
  isVerified: boolean;

  @ApiProperty({ example: '123456' })
  @Column({ type: 'text', nullable: true })
  verificationCode: string | null;

  @ApiProperty({ example: 'email' })
  @Column({ default: 'email', type: 'text' })
  provider: string;

  @ApiProperty({ example: 'Cairo, sans-serif' })
  @Column({ nullable: true, type: 'text' })
  fontFamily: string;

  @ApiProperty({ example: 'inactive' })
  @Column({ default: 'inactive', type: 'text' })
  subscriptionStatus: 'active' | 'inactive' | 'expired';

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @Column({ type: 'timestamp', nullable: true })
  subscribedAt: Date;

  @ApiProperty({ example: 'plan_123' })
  @Column({ nullable: true, type: 'text' })
  planId: string | null;

  @ApiProperty({ example: 'stripe' })
  @Column({ nullable: true, type: 'text' })
  paymentProvider: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Employee, (employee) => employee.company)
  employees: Employee[];

  @OneToMany(() => CompanySubscription, (sub) => sub.company)
  subscriptions: CompanySubscription[];

  @OneToMany(() => CompanyToken, (token) => token.company)
  tokens: CompanyToken[];

  @OneToMany(() => CompanyLoginLog, (log) => log.company)
  loginLogs: CompanyLoginLog[];

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }

  async comparePassword(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.password);
  }
}