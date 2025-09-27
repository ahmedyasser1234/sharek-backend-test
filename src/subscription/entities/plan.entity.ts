import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'decimal' })
  price: number;

  @Column({ type: 'int' })
  maxEmployees: number;

  @Column({ type: 'int' })
  durationInDays: number;

  @Column({ default: false })
  isTrial: boolean;
}
