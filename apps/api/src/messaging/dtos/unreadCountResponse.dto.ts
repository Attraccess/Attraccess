import { ApiProperty } from '@nestjs/swagger';

export class UnreadCountResponseDto {
  @ApiProperty({
    description: 'Total number of unread messages across all conversations of the authenticated user',
    example: 5,
  })
  total!: number;
}
