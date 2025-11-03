import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from './employee.entity';

@Entity('employee_images')
export class EmployeeImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  publicId: string;

  @Column({ type: 'int' })
  employeeId: number;

 @ManyToOne(() => Employee, (employee) => employee.images, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'employeeId' }) 
  employee: Employee;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}