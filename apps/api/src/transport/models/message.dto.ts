import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import { Conversation } from './conversation.dto';
import { MessageReferenceType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class Message {
  @ApiProperty({ description: 'The unique identifier of the message', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the conversation this message belongs to', example: 1 })
  conversationId!: number;

  @ApiProperty({ description: 'The ID of the user who sent this message', example: 1 })
  senderId!: number;

  @ApiProperty({ description: 'The text content of the message', example: 'Hello there' })
  content!: string;

  @ApiProperty({
    description: 'Optional type of context this message references',
    enum: MessageReferenceType,
    example: MessageReferenceType.RESOURCE,
    nullable: true,
  })
  referenceType!: MessageReferenceType | null;

  @ApiProperty({
    description: 'Optional ID of the referenced entity, scoped by referenceType',
    example: 1,
    nullable: true,
  })
  referenceId!: number | null;

  @ApiProperty({
    description: 'Optional cached label of the referenced entity for rendering',
    example: 'Laser Cutter',
    nullable: true,
  })
  referenceLabel!: string | null;

  @ApiProperty({
    description: 'Optional cached URL of the referenced entity for rendering',
    example: '/resources/1',
    nullable: true,
  })
  referenceUrl!: string | null;

  @ApiProperty({
    description: 'When this message was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({ description: 'The conversation this message belongs to', type: () => Conversation })
  conversation!: Conversation;

  @ApiProperty({ description: 'The user who sent this message', type: () => User })
  sender!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    conversationId: null,
    senderId: null,
    content: null,
    referenceType: null,
    referenceId: null,
    referenceLabel: null,
    referenceUrl: null,
    createdAt: null,
    conversation: () => Conversation,
    sender: () => User,
  };
}

export { MessageReferenceType } from '@attraccess/application-models';
