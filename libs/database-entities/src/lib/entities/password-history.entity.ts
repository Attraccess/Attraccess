import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';

@Entity()
@Index(['userId', 'createdAt'])
export class PasswordHistory {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Primary identifier', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'Owning user id', example: 1 })
  userId!: number;

  @Column({ type: 'text' })
  @Exclude()
  @ApiProperty({ description: 'Bcrypt hash of a previously used password', required: false })
  passwordHash!: string;

  @CreateDateColumn()
  @ApiProperty({ description: 'When this entry was recorded' })
  createdAt!: Date;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
