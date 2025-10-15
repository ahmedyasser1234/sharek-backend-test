import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RevokedToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  expiresAt: Date;
}
