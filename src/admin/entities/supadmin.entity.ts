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

export interface BaseSupadmin {
  id: string;
  role: SupadminRole;
}

@Entity('supadmins')
export class Supadmin implements BaseSupadmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

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
  fullName: any;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
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
    const isSuperAdmin = this.role === SupadminRole.SUPER_ADMIN;
    
    return {
      canManagePlans: isSuperAdmin,
      canManageSellers: isSuperAdmin,
      canManageCompanies: isSuperAdmin,
      canManageSubscriptions: isSuperAdmin,
      canManagePayments: isSuperAdmin,
      canViewReports: isSuperAdmin,
      canDownloadDatabase: isSuperAdmin,
    };
  }
}