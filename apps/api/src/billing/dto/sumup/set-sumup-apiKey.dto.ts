import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetSumUpApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The API key for the SumUp API',
    example: '1234567890',
    required: true,
  })
  apiKey!: string;
}
