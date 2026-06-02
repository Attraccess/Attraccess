import { Message } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../types/response';

export class ListMessagesResponseDto extends PaginatedResponse<Message> {
  @ApiProperty({
    type: [Message],
  })
  data: Message[];
}
