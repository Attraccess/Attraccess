import { ApiProperty } from '@nestjs/swagger';

export class AttractapSecureImage {
  @ApiProperty({ description: 'Unsigned secure-profile app image (never offered to the web flasher or plain OTA)' })
  appFilename: string;

  @ApiProperty({ description: 'Unsigned secure-profile bootloader image' })
  bootloaderFilename: string;

  @ApiProperty({ description: 'Anti-rollback SECURE_VERSION of the secure app', example: 1 })
  secureVersion: number;

  @ApiProperty({ description: 'Profile marker the secure app carries', example: 'attractap-secure-profile-v1' })
  profileMarker: string;

  @ApiProperty({ description: 'SHA-256 (hex) of the unsigned secure app' })
  appSha256: string;

  @ApiProperty({ description: 'SHA-256 (hex) of the unsigned secure bootloader' })
  bootloaderSha256: string;

  @ApiProperty({ description: 'SHA-256 (hex) of the partition table the secure build expects' })
  partitionTableSha256: string;
}

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
    description: 'The filename of the unstripped ELF used to symbolicate coredumps',
    example: 'attractap_eth.elf',
    nullable: true,
    required: false,
  })
  elfFilename?: string | null;

  @ApiProperty({
    description: 'The app ELF SHA256 (build id) that matches this firmware to a coredump',
    example: 'f6899cb1067e5043',
    nullable: true,
    required: false,
  })
  buildId?: string | null;

  @ApiProperty({
    description: 'The ESP chip type (esp32, esp32s2, esp32s3, esp32c3)',
    example: 'esp32s3',
  })
  chip: string;

  @ApiProperty({
    description:
      'Whether the secure firmware profile has been verified on real hardware for this variant. Missing means false; always false for demo variants.',
    example: false,
    required: false,
  })
  secureProfileHardwareTested?: boolean;

  @ApiProperty({
    description:
      'Unsigned secure-profile images for the "Secure this reader" conversion. Only present for variants built with the secure profile; the server signs them per installation.',
    type: () => AttractapSecureImage,
    required: false,
  })
  secureImage?: AttractapSecureImage;

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
