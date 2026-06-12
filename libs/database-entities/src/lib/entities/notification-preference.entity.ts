import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity()
@Index(['userId'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the notification preference entry', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the user these preferences belong to', example: 1 })
  userId!: number;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description:
      'Whether to send an email fallback when a direct message arrives while the user is offline. Defaults to true (opt-out).',
    example: true,
    default: true,
  })
  messagesEmailOnOffline!: boolean;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description:
      'Whether to send a browser push notification when a direct message arrives while the user is offline. Defaults to true (opt-out).',
    example: true,
    default: true,
  })
  messagesPushEnabled!: boolean;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'JSON map of notification categories to enabled channels.',
    required: false,
    nullable: true,
  })
  categoryChannels!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The user these preferences belong to', type: () => User })
  user!: User;
}
