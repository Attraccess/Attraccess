import { ApiProperty } from '@nestjs/swagger';
import { AttractapReaderDto } from './reader.dto';

export class UpdateReaderResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Reader updated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'The updated reader',
    type: AttractapReaderDto,
  })
  reader: AttractapReaderDto;
}
