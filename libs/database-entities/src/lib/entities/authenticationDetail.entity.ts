import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { AuthenticationType } from '../types/authenticationType.enum';

@Entity()
export class AuthenticationDetail {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the authentication detail',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user',
    example: 1,
  })
  userId!: number;

  @Column({
    type: 'simple-enum',
    enum: AuthenticationType,
  })
  @ApiProperty({
    description: 'The type of authentication',
    enum: AuthenticationType,
    example: AuthenticationType.LOCAL_PASSWORD,
    enumName: 'AuthenticationType',
  })
  type!: AuthenticationType;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'The hashed password (for local authentication)',
    required: false,
  })
  password?: string;

  @ManyToOne(() => User, (user) => user.authenticationDetails, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
