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

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',      
  SUPERVISOR = 'supervisor',       
}

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

  @Column({ 
    type: 'enum',
    enum: AdminRole,
    default: AdminRole.SUPERVISOR   
  })
  role: AdminRole;

  @Column({ nullable: true, length: 100, comment: 'اسم البنك' })
  bankName: string;

  @Column({ nullable: true, length: 50, comment: 'رقم الحساب البنكي' })
  accountNumber: string;

  @Column({ nullable: true, length: 34, comment: 'رقم الآيبان' })
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

  canAccess(resource: string): boolean {
    if (this.role === AdminRole.SUPER_ADMIN) {
      return true; 
    }

    const supervisorPermissions = [
      'view_managers',
      'create_managers',
      'edit_managers',
      'view_companies',
      'edit_companies',
      'activate_subscription',
      'view_subscriptions',
    ];

    return supervisorPermissions.includes(resource);
  }
}