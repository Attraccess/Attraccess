import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorDto {
  @ApiProperty({
    description: 'The ID of the node that has the validation error',
    example: 'node-123',
  })
  nodeId: string;

  @ApiProperty({
    description: 'The type of the node that has the validation error',
    example: 'action.http.sendRequest',
  })
  nodeType: string;

  @ApiProperty({
    description: 'The field that has the validation error',
    example: 'url',
  })
  field: string;

  @ApiProperty({
    description: 'The validation error message',
    example: 'Invalid URL format',
  })
  message: string;

  @ApiProperty({
    description: 'The invalid value that caused the error',
    required: false,
    example: 'invalid-url',
  })
  value?: unknown;
}
