import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Admin } from './admin.entity';

@Entity('admin_tokens')
export class AdminToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  refreshToken: string;

  @ManyToOne(() => Admin, admin => admin.createdManagers)
  @JoinColumn({ name: 'adminId' })
  admin: Admin;

  @Column()
  adminId: string;

  @CreateDateColumn()
  createdAt: Date;
}