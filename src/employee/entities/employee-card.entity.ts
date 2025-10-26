import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Employee } from './employee.entity';

@Entity()
export class EmployeeCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ unique: true })
  uniqueUrl: string;

  @Column({ type: 'text' })
  qrCode: string;

  @Column({ default: 'classic' })
  designId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fontColorHead: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fontColorHead2: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fontColorParagraph: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fontColorExtra: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sectionBackground: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  Background: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sectionBackground2: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  dropShadow: string | null;

  @Column({ type: 'int', default: 1 })
  qrStyle: number;

  @Column({ type: 'int', default: 1 })
  shadowX : number;

  @Column({ type: 'int', default: 1 })
  shadowY : number;

  @Column({ type: 'int', default: 1 })
  shadowBlur : number;

  @Column({ type: 'int', default: 1 })
  shadowSpread : number;

  @Column({ type: 'int', default: 1 })
  cardRadius : number;

  @Column({ type: 'boolean', default: false })
  cardStyleSection: boolean;

  @Column({ type: 'varchar', nullable: true })
  backgroundImage: string | null;

  @Column({ type: 'int' })
  employeeId: number;

  @ManyToOne(() => Employee, (employee) => employee.cards, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employeeId' }) 
  employee: Employee;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}