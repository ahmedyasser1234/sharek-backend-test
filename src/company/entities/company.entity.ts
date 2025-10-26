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
import bcrypt from 'bcryptjs';

@Entity()
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column({ unique: true, type: 'text' })
  email: string;

  @Column('text')
  password: string;

  @Column('text')
  phone: string;

  @Column({ nullable: true, type: 'text' })
  logoUrl: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 'admin', type: 'text' })
  role: string;

  @Column({ nullable: true, type: 'uuid' })
  defaultDesignId: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'text', nullable: true })
  verificationCode: string | null;

  @Column({ default: 'email', type: 'text' })
  provider: string;

  @Column({ nullable: true, type: 'text' })
  fontFamily: string;

  @Column({ default: 'inactive', type: 'text' })
  subscriptionStatus: 'active' | 'inactive' | 'expired';

  @Column({ type: 'timestamp', nullable: true })
  subscribedAt: Date;

  @Column({ nullable: true, type: 'text' })
  planId: string | null;

  @Column({ nullable: true, type: 'text' })
  paymentProvider: string;

  @OneToMany(() => Employee, (employee) => employee.company)
  employees: Employee[];

  @OneToMany(() => CompanySubscription, (sub) => sub.company)
  subscriptions: CompanySubscription[];

  @OneToMany(() => CompanyToken, (token) => token.company)
  tokens: CompanyToken[];

  @OneToMany(() => CompanyLoginLog, (log) => log.company)
  loginLogs: CompanyLoginLog[];

  
    @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

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
