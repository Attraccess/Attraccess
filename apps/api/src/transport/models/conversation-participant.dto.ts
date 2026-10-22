import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import { Conversation } from './conversation.dto';
import type { ResponseFields } from '../response-mapper';

export class ConversationParticipant {
  @ApiProperty({ description: 'The unique identifier of the participant entry', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the conversation this participant belongs to', example: 1 })
  conversationId!: number;

  @ApiProperty({ description: 'The ID of the participating user', example: 1 })
  userId!: number;

  @ApiProperty({
    description: 'When this participant last read the conversation',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastReadAt!: Date | null;

  @ApiProperty({
    description:
      'When this participant was last sent an offline email notification for this conversation. Used to debounce email fallback to once per unread burst.',
    example: '2025-01-18T12:30:00.000Z',
    nullable: true,
  })
  lastNotifiedAt!: Date | null;

  @ApiProperty({ description: 'The conversation this participant belongs to', type: () => Conversation })
  conversation!: Conversation;

  @ApiProperty({ description: 'The participating user', type: () => User })
  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    conversationId: null,
    userId: null,
    lastReadAt: null,
    lastNotifiedAt: null,
    conversation: () => Conversation,
    user: () => User,
  };
}
