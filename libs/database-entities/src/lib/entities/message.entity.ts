import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Conversation } from './conversation.entity';

export enum MessageReferenceType {
  RESOURCE = 'RESOURCE',
  ACTIVITY = 'ACTIVITY',
}

@Entity()
@Index(['conversationId', 'createdAt'])
@Index(['senderId'])
export class Message {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the message', example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the conversation this message belongs to', example: 1 })
  conversationId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the user who sent this message', example: 1 })
  senderId!: number;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'The text content of the message', example: 'Hello there' })
  content!: string;

  @Column({ type: 'text', nullable: true, enum: MessageReferenceType })
  @ApiProperty({
    description: 'Optional type of context this message references',
    enum: MessageReferenceType,
    example: MessageReferenceType.RESOURCE,
    nullable: true,
  })
  referenceType!: MessageReferenceType | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'Optional ID of the referenced entity, scoped by referenceType',
    example: 1,
    nullable: true,
  })
  referenceId!: number | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional cached label of the referenced entity for rendering',
    example: 'Laser Cutter',
    nullable: true,
  })
  referenceLabel!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional cached URL of the referenced entity for rendering',
    example: '/resources/1',
    nullable: true,
  })
  referenceUrl!: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When this message was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  @ApiProperty({ description: 'The conversation this message belongs to', type: () => Conversation })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  @ApiProperty({ description: 'The user who sent this message', type: () => User })
  sender!: User;
}
