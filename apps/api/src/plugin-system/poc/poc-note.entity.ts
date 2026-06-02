import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class PocNote {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  message!: string;
}
