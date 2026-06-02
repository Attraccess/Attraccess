import { ApiProperty } from '@nestjs/swagger';
import { Message, User } from '@attraccess/database-entities';

export class ConversationListItemDto {
  @ApiProperty({
    description: 'The unique identifier of the conversation',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The other participant of this 1:1 conversation',
    type: () => User,
    nullable: true,
  })
  otherParticipant!: User | null;

  @ApiProperty({
    description: 'The most recent message in the conversation',
    type: () => Message,
    nullable: true,
  })
  lastMessage!: Message | null;

  @ApiProperty({
    description: 'When this conversation was last updated',
    example: '2025-01-18T12:30:00.000Z',
  })
  updatedAt!: Date;
}
