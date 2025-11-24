import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne, 
  JoinColumn, 
  OneToMany 
} from 'typeorm';
import { Admin } from '../../admin/entities/admin.entity';
import { ManagerToken } from './manager-token.entity';
import { CompanySubscription } from '../../subscription/entities/company-subscription.entity';

export enum ManagerRole {
  SELLER = 'seller'  
}

@Entity('managers')
export class Manager {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: ManagerRole, default: ManagerRole.SELLER })
  role: ManagerRole;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Admin, admin => admin.createdManagers)
  @JoinColumn({ name: 'createdById' })
  createdBy: Admin;

  @Column()
  createdById: string;

  @OneToMany(() => ManagerToken, token => token.manager)
  tokens: ManagerToken[];

  @OneToMany(() => CompanySubscription, subscription => subscription.activatedBySeller)
  activatedSubscriptions: CompanySubscription[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}