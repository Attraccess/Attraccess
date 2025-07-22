import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity()
@Index(['token'], { unique: true })
@Index(['userId'])
@Index(['expiresAt'])
export class Session {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the session',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text', unique: true })
  @ApiProperty({
    description: 'The session token',
    example: 'abc123def456...',
  })
  token!: string;

  @Column({ type: 'int' })
  @ApiProperty({
    description: 'The ID of the user this session belongs to',
    example: 1,
  })
  userId!: number;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The user agent string from the request that created this session',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    nullable: true,
  })
  userAgent!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The IP address from the request that created this session',
    example: '192.168.1.100',
    nullable: true,
  })
  ipAddress!: string | null;

  @Column({ type: 'datetime' })
  @ApiProperty({
    description: 'When this session expires',
    example: '2025-01-19T12:00:00.000Z',
  })
  expiresAt!: Date;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When this session was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When this session was last accessed',
    example: '2025-01-18T12:30:00.000Z',
  })
  lastAccessedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @ApiProperty({
    description: 'The user this session belongs to',
    type: () => User,
  })
  user!: User;
}