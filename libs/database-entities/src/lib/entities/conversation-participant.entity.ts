import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Conversation } from './conversation.entity';

@Entity()
@Index(['conversationId', 'userId'], { unique: true })
export class ConversationParticipant {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the participant entry', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the conversation this participant belongs to', example: 1 })
  conversationId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the participating user', example: 1 })
  userId!: number;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When this participant last read the conversation',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastReadAt!: Date | null;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  @ApiProperty({ description: 'The conversation this participant belongs to', type: () => Conversation })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The participating user', type: () => User })
  user!: User;
}
