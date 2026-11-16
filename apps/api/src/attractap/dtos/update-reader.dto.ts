import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class UpdateReaderDto {
  @ApiProperty({
    description: 'The name of the reader',
    example: 'Main Entrance Reader',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'The IDs of the resources that the reader has access to',
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  @IsNumber({}, { each: true })
  connectedResourceIds: number[];

  @ApiProperty({
    description: 'Global LED brightness for the reader (0-255)',
    example: 255,
    required: false,
    minimum: 0,
    maximum: 255,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(255)
  ledBrightness?: number;

  @ApiProperty({
    description:
      'Allow backend plugins with the BLE_TRANSPORT permission to use the Bluetooth radio of this reader. Turning it off closes active plugin BLE sessions on the reader. Omit to keep the current setting.',
    example: false,
    required: false,
  })
  // Strict: the global implicit conversion would turn the string "false" into true, and null would reach
  // the NOT NULL column. Only a real boolean, or an omitted field, is valid for this permission switch.
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  allowPluginBle?: boolean;
}
