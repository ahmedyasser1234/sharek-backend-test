import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Manager } from './manager.entity';

@Entity('manager_tokens')
export class ManagerToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  refreshToken: string;

  @ManyToOne(() => Manager)
  @JoinColumn({ name: 'managerId' })
  manager: Manager;

  @Column()
  managerId: string;

  @CreateDateColumn()
  createdAt: Date;
}