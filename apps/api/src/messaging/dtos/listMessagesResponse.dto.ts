import type { MessageRecord } from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../types/response';
import { Message } from './message.dto';

export class ListMessagesResponseDto extends PaginatedResponse<MessageRecord> {
  @ApiProperty({
    type: [Message],
  })
  data: MessageRecord[];
}
