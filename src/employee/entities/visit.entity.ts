import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Column,
  JoinColumn,
  Index,
} from 'typeorm';
import { Employee } from './employee.entity';

@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Employee, (employee) => employee.visits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  @Index()
  employee: Employee;

  @CreateDateColumn({ name: 'visitedAt' })
  visitedAt: Date;

  @Column({ default: 'link' })
  source: string;

  @Column({ nullable: true })
  os: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  deviceType: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  country: string;
}
