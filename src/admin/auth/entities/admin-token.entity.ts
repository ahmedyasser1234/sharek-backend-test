import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Admin } from '../../entities/admin.entity';

@Entity()
export class AdminToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

 @Column({ unique: true })
 refreshToken: string;

  @ManyToOne(() => Admin, (admin) => admin.tokens, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  admin: Admin;
}
