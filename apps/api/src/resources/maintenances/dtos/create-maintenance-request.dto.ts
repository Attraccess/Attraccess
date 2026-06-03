import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateMaintenanceRequestDto {
  @ApiProperty({
    description: 'Why the user thinks the resource needs maintenance',
    example: 'The spindle makes a grinding noise and stops mid-cut.',
    minLength: 3,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
