import { LED_PATTERN_COLORS, LedPatternColor } from '../led-pattern';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

export class ApproveLiteEnrollmentDto {
  @ApiProperty({ description: 'ID from the list of waiting Lite readers', format: 'uuid' })
  @IsUUID()
  pendingId: string;

  @ApiProperty({
    description: 'The four colours shown on the reader, in the order of the list entry',
    enum: LED_PATTERN_COLORS,
    enumName: 'LedPatternColor',
    isArray: true,
    example: ['red', 'green', 'blue', 'yellow'],
  })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsIn([...LED_PATTERN_COLORS], { each: true })
  pattern: LedPatternColor[];

  @ApiProperty({ description: 'Optional name for the new device', required: false, example: 'Laser room reader' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name?: string;
}

export class LiteFirmwareDto {
  @ApiProperty({ required: false }) name?: string;
  @ApiProperty({ required: false }) variant?: string;
  @ApiProperty({ required: false }) version?: string;
}

export class WaitingLiteReaderDto {
  @ApiProperty({ format: 'uuid', description: 'Random handle of this waiting request' })
  pendingId: string;

  @ApiProperty({
    enum: LED_PATTERN_COLORS,
    enumName: 'LedPatternColor',
    isArray: true,
    description: 'Colours of the four segments on the ring',
  })
  pattern: LedPatternColor[];

  @ApiProperty({ description: 'Seconds until the reader shows a new pattern', example: 21 })
  rotatesInSeconds: number;

  @ApiProperty({ type: LiteFirmwareDto, nullable: true })
  firmware: LiteFirmwareDto | null;

  @ApiProperty({ format: 'date-time' })
  waitingSince: string;

  @ApiProperty({ example: '192.168.1.20' })
  clientAddress: string;
}
