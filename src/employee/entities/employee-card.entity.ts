import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
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

  @ManyToOne(() => Employee, (employee) => employee.cards, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  employee: Employee;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
