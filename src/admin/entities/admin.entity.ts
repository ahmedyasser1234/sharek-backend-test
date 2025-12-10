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
import { Supadmin } from './supadmin.entity';

// تعريف enum لحالات الاشتراك لاستخدامه في المقارنات الآمنة
export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', default: 'admin' })
  role: string;

  @Column({ type: 'varchar', nullable: true, comment: 'اسم البنك' })
  bankName: string | null;

  @Column({ type: 'varchar', nullable: true, comment: 'رقم الحساب البنكي' })
  accountNumber: string | null;

  @Column({ type: 'varchar', nullable: true, comment: 'رقم الآيبان' })
  ibanNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @OneToMany(() => AdminToken, (token) => token.admin)
  tokens: AdminToken[];

  @OneToMany(() => Manager, (manager) => manager.createdBy)
  createdManagers: Manager[];

  @OneToMany(() => CompanySubscription, (subscription) => subscription.activatedByAdmin)
  activatedSubscriptions: CompanySubscription[];

  @OneToMany(() => Supadmin, (supadmin) => supadmin.createdBy)
  createdSupadmins: Supadmin[];

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
  }

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

  canCreateSupadmin(): boolean {
    return this.isActive;
  }

  getStats(): {
    createdManagers: number;
    activatedSubscriptions: number;
    createdSupadmins: number;
  } {
    return {
      createdManagers: this.createdManagers?.length || 0,
      activatedSubscriptions: this.activatedSubscriptions?.length || 0,
      createdSupadmins: this.createdSupadmins?.length || 0,
    };
  }

  getBankInfo(): {
    bankName: string | null;
    accountNumber: string | null;
    ibanNumber: string | null;
  } {
    return {
      bankName: this.bankName || null,
      accountNumber: this.accountNumber || null,
      ibanNumber: this.ibanNumber || null,
    };
  }

  hasBankInfo(): boolean {
    return !!(this.bankName && this.accountNumber && this.ibanNumber);
  }

  getEmailDomain(): string {
    return this.email.split('@')[1] || '';
  }

  hasPermission(permission: string): boolean {
    const adminPermissions: Record<string, boolean> = {
      'manage_managers': true,
      'manage_subscriptions': true,
      'manage_bank_info': true,
      'view_reports': true,
      'create_supadmins': true,
    };
    
    return adminPermissions[permission] || false;
  }

  createSupadminData(email: string, password: string, fullName?: string): {
    email: string;
    password: string;
    fullName?: string;
    createdBy: Admin;
  } {
    return {
      email: email.toLowerCase().trim(),
      password,
      fullName,
      createdBy: this,
    };
  }

  canDeleteSupadmin(supadminId: string): boolean {
    return this.createdSupadmins?.some(supadmin => supadmin.id === supadminId) || false;
  }

  getProfileInfo() {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      isActive: this.isActive,
      createdAt: this.createdAt,
      hasBankInfo: this.hasBankInfo(),
      stats: this.getStats(),
    };
  }

  isActiveAndValid(): boolean {
    return this.isActive && !this.deletedAt;
  }

  logActivity(activity: string): {
    adminId: string;
    email: string;
    activity: string;
    timestamp: Date;
  } {
    return {
      adminId: this.id,
      email: this.email,
      activity,
      timestamp: new Date(),
    };
  }

  canUpdateBankInfo(): boolean {
    return this.isActiveAndValid();
  }

  async resetPassword(newPassword: string): Promise<void> {
    this.password = newPassword;
    await this.hashPassword();
    this.updatedAt = new Date();
  }

  hasActiveSubscriptions(): boolean {
    if (!this.activatedSubscriptions) return false;
    
    return this.activatedSubscriptions.some(sub => {
      if (!sub.status) return false;
      
      const subscriptionStatus = String(sub.status);
      const isActive = subscriptionStatus.toLowerCase() === 'active';
      const isNotExpired = !sub.isExpired || !sub.isExpired();
      
      return isActive && isNotExpired;
    });
  }

  getCreatedSupadminsInfo() {
    if (!this.createdSupadmins) return [];
    
    return this.createdSupadmins.map(supadmin => ({
      id: supadmin.id,
      email: supadmin.email,
      role: supadmin.role,
      isActive: supadmin.isActive,
      createdAt: supadmin.createdAt,
    }));
  }

  getCreatedManagersInfo() {
    if (!this.createdManagers) return [];
    
    return this.createdManagers.map(manager => ({
      id: manager.id,
      email: manager.email,
      role: manager.role,
      isActive: manager.isActive,
      createdAt: manager.createdAt,
    }));
  }

  getActivatedSubscriptionsInfo() {
    if (!this.activatedSubscriptions) return [];
    
    return this.activatedSubscriptions.map(subscription => ({
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      status: subscription.status ? String(subscription.status) : 'unknown',
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      price: subscription.price,
      createdAt: subscription.createdAt,
    }));
  }

  updateBankInfo(bankName: string, accountNumber: string, ibanNumber: string): void {
    this.bankName = bankName;
    this.accountNumber = accountNumber;
    this.ibanNumber = ibanNumber;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.deletedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.deletedAt = null;
  }

  isDeleted(): boolean {
    return !!this.deletedAt;
  }

  getSecureBankInfo(): {
    bankName: string | null;
    maskedAccountNumber: string | null;
    maskedIbanNumber: string | null;
  } {
    const maskString = (str: string | null): string | null => {
      if (!str) return null;
      if (str.length <= 4) return str;
      return '****' + str.slice(-4);
    };

    return {
      bankName: this.bankName || null,
      maskedAccountNumber: maskString(this.accountNumber),
      maskedIbanNumber: maskString(this.ibanNumber),
    };
  }

  canAccess(feature: string): boolean {
    const featuresAccess: Record<string, boolean> = {
      'dashboard': true,
      'managers': this.hasPermission('manage_managers'),
      'subscriptions': this.hasPermission('manage_subscriptions'),
      'bank_info': this.hasPermission('manage_bank_info'),
      'reports': this.hasPermission('view_reports'),
      'supadmins': this.hasPermission('create_supadmins'),
    };

    return featuresAccess[feature] || false;
  }
}