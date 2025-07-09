import { ApiProperty } from '@nestjs/swagger';

export class UpdateReaderDto {
  @ApiProperty({
    description: 'The name of the reader',
    example: 'Main Entrance Reader',
  })
  name: string;

  @ApiProperty({
    description: 'The IDs of the resources that the reader has access to',
    type: [Number],
  })
  connectedResources: number[];
}
