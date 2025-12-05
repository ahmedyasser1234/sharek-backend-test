import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AdminToken } from '../auth/entities/admin-token.entity';
import { Manager } from './manager.entity';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 'admin' })
  role: string;

  @Column({ nullable: true, comment: 'اسم البنك' })
  bankName: string;

  @Column({ nullable: true, comment: 'رقم الحساب البنكي' })
  accountNumber: string;

  @Column({ nullable: true, comment: 'رقم الآيبان' })
  ibanNumber: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @OneToMany(() => AdminToken, (token) => token.admin)
  tokens: AdminToken[];

  @OneToMany(() => Manager, (manager) => manager.createdBy)
  createdManagers: Manager[];

  @OneToMany(() => CompanySubscription, subscription => subscription.activatedByAdmin)
  activatedSubscriptions: CompanySubscription[];

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