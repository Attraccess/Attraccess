import { ApiProperty } from '@nestjs/swagger';
import type { MessageRecord, MessagingUser } from '@attraccess/application-models';
import { UserSchemaRef } from '../../types/user-schema-ref';
import { Message } from './message.dto';

export class ConversationListItemDto {
  @ApiProperty({
    description: 'The unique identifier of the conversation',
    example: 1,
  })
  id!: number;

  @UserSchemaRef({ description: 'The other participant of this 1:1 conversation', nullable: true })
  otherParticipant!: MessagingUser | null;

  @ApiProperty({
    description: 'Whether the other participant currently has an open live messaging stream',
    example: true,
  })
  otherParticipantOnline!: boolean;

  @ApiProperty({
    description: 'The most recent message in the conversation',
    type: () => Message,
    nullable: true,
  })
  lastMessage!: MessageRecord | null;

  @ApiProperty({
    description: 'When this conversation was last updated',
    example: '2025-01-18T12:30:00.000Z',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Number of messages in this conversation the authenticated user has not read yet',
    example: 3,
  })
  unreadCount!: number;
}
