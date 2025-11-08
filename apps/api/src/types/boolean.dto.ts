import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BooleanDto {
  @IsBoolean()
  @ApiProperty({
    description: 'The boolean value',
    example: true,
    required: true,
  })
  value!: boolean;
}
