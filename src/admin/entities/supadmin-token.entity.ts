import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  ManyToOne, 
  JoinColumn, 
  CreateDateColumn 
} from 'typeorm';
import { Supadmin } from './supadmin.entity';

@Entity('supadmin_tokens')
export class SupadminToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  refreshToken: string;

  @ManyToOne(() => Supadmin, { 
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'supadminId' })
  supadmin: Supadmin;

  @Column()
  supadminId: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;
}