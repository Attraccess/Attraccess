import { ApiProperty } from '@nestjs/swagger';

export class AttractapFirmware {
  @ApiProperty({
    description: 'The name of the firmware',
    example: 'attractap',
  })
  name: string;

  @ApiProperty({
    description: 'The friendly name of the firmware',
    example: 'Attractap (Ethernet)',
  })
  friendlyName: string;

  @ApiProperty({
    description: 'The variant of the firmware',
    example: 'eth',
  })
  variant: string;

  @ApiProperty({
    description: 'The variant of the firmware',
    example: 'eth',
  })
  variantFriendlyName: string;

  @ApiProperty({
    description: 'The version of the firmware',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'The board family of the firmware',
    example: 'ESP32_C3',
  })
  boardFamily: string;

  @ApiProperty({
    description: 'The filename of the firmware',
    example: 'attractap_eth.bin',
  })
  filename: string;

  @ApiProperty({
    description: 'The filename of the firmware for OTA updates (zlib compressed)',
    example: 'attractap_eth.bin.zz',
  })
  filenameOTA: string;
}
