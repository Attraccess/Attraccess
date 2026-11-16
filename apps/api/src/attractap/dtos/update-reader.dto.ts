import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @IsOptional()
  @IsBoolean()
  allowPluginBle?: boolean;
}
