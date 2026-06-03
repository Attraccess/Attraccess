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

  @ApiProperty({
    description: 'The filename of the unstripped ELF used for coredump symbolication',
    example: 'attractap_eth.elf',
    required: false,
  })
  elfFilename?: string;

  @ApiProperty({
    description: 'The application ELF SHA256 build id (first 16 hex chars) used to match a coredump to its ELF',
    example: 'f6899cb1067e5043',
    required: false,
  })
  buildId?: string;

  @ApiProperty({
    description: 'The ESP chip type (esp32, esp32s2, esp32s3, esp32c3)',
    example: 'esp32s3',
  })
  chip: string;

  @ApiProperty({
    description: 'The flash mode for programming (qio, qout, dio, dout)',
    example: 'dio',
  })
  flashMode: string;

  @ApiProperty({
    description: 'The flash frequency for programming (80m, 40m, 26m, 20m)',
    example: '80m',
  })
  flashFreq: string;

  @ApiProperty({
    description: 'The flash size (4MB, 8MB, 16MB, etc.)',
    example: '16MB',
  })
  flashSize: string;
}
