import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';
import { SupadminToken } from './supadmin-token.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { Admin } from '../../admin/entities/admin.entity';

export enum SupadminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MANAGER = 'manager'
}

// تعريف واجهة BaseSupadmin
export interface BaseSupadmin {
  id: string;
  role: SupadminRole;
  canManagePlans?: boolean;
  canManageSellers?: boolean;
  canManageCompanies?: boolean;
  canManageSubscriptions?: boolean;
  canManagePayments?: boolean;
  canViewReports?: boolean;
  canDownloadDatabase?: boolean;
}

@Entity('supadmins')
export class Supadmin implements BaseSupadmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({
    name: 'normalized_email',
    unique: true,
    nullable: true
  })
  normalizedEmail: string | null;

  @Column()
  password: string;

  @Column({ 
    type: 'enum', 
    enum: SupadminRole, 
    default: SupadminRole.ADMIN 
  })
  role: SupadminRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  fullName: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ default: false })
  canManagePlans: boolean;

  @Column({ default: false })
  canManageSellers: boolean;

  @Column({ default: false })
  canManageCompanies: boolean;

  @Column({ default: false })
  canManageSubscriptions: boolean;

  @Column({ default: false })
  canManagePayments: boolean;

  @Column({ default: false })
  canViewReports: boolean;

  @Column({ default: false })
  canDownloadDatabase: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date | null;

  @Column({ nullable: true })
  lastLoginIp: string | null;

  @ManyToOne(() => Admin, { 
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn({ name: 'createdById' })
  createdBy: Admin | null;

  @Column({ nullable: true })
  createdById: string | null;

  @OneToMany(() => CompanySubscription, (subscription) => subscription.activatedBySupadmin)
  activatedSubscriptions: CompanySubscription[];

  @OneToMany(() => SupadminToken, (token) => token.supadmin)
  tokens: SupadminToken[];

  @OneToMany(() => Plan, (plan) => plan.createdBySupadmin)
  createdPlans: Plan[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    if (this.email) {
      this.normalizedEmail = this.email.toLowerCase().trim();
      this.email = this.normalizedEmail;
    }
  }

  hasPermission(permission: string): boolean {
    const permissionsMap: Record<string, boolean> = {
      'manage_plans': this.canManagePlans,
      'manage_sellers': this.canManageSellers,
      'manage_companies': this.canManageCompanies,
      'manage_subscriptions': this.canManageSubscriptions,
      'manage_payments': this.canManagePayments,
      'view_reports': this.canViewReports,
      'download_database': this.canDownloadDatabase,
    };

    return permissionsMap[permission] || false;
  }

  hasRole(role: SupadminRole | SupadminRole[]): boolean {
    if (Array.isArray(role)) {
      return role.includes(this.role);
    }
    return this.role === role;
  }

  get createdByEmail(): string {
    return this.createdBy?.email || 'النظام';
  }

  getPermissions(): Record<string, boolean> {
    return {
      canManagePlans: this.canManagePlans || this.role === SupadminRole.SUPER_ADMIN,
      canManageSellers: this.canManageSellers || this.role === SupadminRole.SUPER_ADMIN,
      canManageCompanies: this.canManageCompanies || this.role === SupadminRole.SUPER_ADMIN,
      canManageSubscriptions: this.canManageSubscriptions || this.role === SupadminRole.SUPER_ADMIN,
      canManagePayments: this.canManagePayments || this.role === SupadminRole.SUPER_ADMIN,
      canViewReports: this.canViewReports || this.role === SupadminRole.SUPER_ADMIN,
      canDownloadDatabase: this.canDownloadDatabase || this.role === SupadminRole.SUPER_ADMIN,
    };
  }
}