import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
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

  @ManyToOne(() => Employee, employee => employee.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: number;

  @Column({ nullable: true })
  publicId: string;

}
