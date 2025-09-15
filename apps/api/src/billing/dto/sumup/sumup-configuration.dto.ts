import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SumUpConfigurationDto {
  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Whether the SumUp configuration is enabled',
    example: true,
    required: true,
  })
  enabled!: boolean;
}
