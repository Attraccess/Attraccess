import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity()
@Index(['userId'])
export class PushSubscription {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the push subscription', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the user this subscription belongs to', example: 1 })
  userId!: number;

  @Column({ type: 'text', unique: true })
  @ApiProperty({
    description: 'The push service endpoint URL that uniquely identifies this subscription (one per device/browser)',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  endpoint!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'The P-256 ECDH public key of the subscription, used to encrypt push payloads' })
  p256dh!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'The authentication secret of the subscription, used to encrypt push payloads' })
  auth!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The user agent of the browser that created this subscription, for display/debugging',
    example: 'Mozilla/5.0 (X11; Linux x86_64) ...',
    nullable: true,
  })
  userAgent!: string | null;

  @CreateDateColumn()
  @ApiProperty({ description: 'When this subscription was created', example: '2025-01-18T12:30:00.000Z' })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When this subscription was last re-confirmed by the client',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastSeenAt!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The user this subscription belongs to', type: () => User })
  user!: User;
}
