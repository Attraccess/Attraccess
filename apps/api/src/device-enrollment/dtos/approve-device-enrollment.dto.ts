import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveDeviceEnrollmentDto {
  @ApiProperty({
    description: 'The code shown on the waiting device. Case, spaces and the hyphen do not matter.',
    example: 'K7P-3XQ',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ description: 'Optional name for the new device', required: false, example: 'Laser room reader' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name?: string;
}

export class ApproveDeviceEnrollmentResponseDto {
  @ApiProperty({ enum: ['reader'], example: 'reader' })
  kind: 'reader';

  @ApiProperty({ description: 'ID of the new device', example: 1 })
  id: number;

  @ApiProperty({ description: 'Name of the new device', example: 'Laser room reader' })
  name: string;
}
