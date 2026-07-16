import { ApiProperty } from '@nestjs/swagger';

export class PreviewMjmlResponseDto {
  @ApiProperty({
    description: 'The HTML content of the MJML',
    example: '<div>Hello, world!</div>',
  })
  html: string;

  @ApiProperty({
    description: 'Indicates if there were any errors during conversion',
    example: false,
  })
  hasErrors: boolean;

  @ApiProperty({
    description: 'Error message if conversion failed',
    example: null,
    required: false,
  })
  error?: string;
}
