import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

class AttractapCapabilities {
  @ApiProperty({
    description: 'Whether the reader can choose from many linked resources or can only handle one',
    example: true,
    default: true,
  })
  resourceSelection!: boolean;

  @ApiProperty({
    description:
      'Whether the reader has interface options for triggering resource actions, if not a actions is triggered immediately upon scanning a nfc card',
    example: true,
    default: true,
  })
  resourceActionSelection!: boolean;

  @ApiProperty({
    description: 'Whether the reader can enroll new cards',
    example: true,
    default: true,
  })
  cardEnrollment!: boolean;

  @ApiProperty({
    description: 'Whether the reader has addressable LEDs',
    example: false,
    default: false,
  })
  hasLeds!: boolean;
  static readonly responseFields: ResponseFields = {
    resourceSelection: null,
    resourceActionSelection: null,
    cardEnrollment: null,
    hasLeds: null,
  };
}

export class AttractapFirmwareVersion {
  @ApiProperty({ description: 'The name of the firmware', example: 'Attractap', nullable: true })
  name!: string | null;

  @ApiProperty({ description: 'The variant of the firmware', example: 'eth', nullable: true })
  variant!: string | null;

  @ApiProperty({ description: 'The version of the firmware', example: '1.0.0', nullable: true })
  version!: string | null;

  @ApiProperty({ description: 'The capabilities of the reader', type: () => AttractapCapabilities })
  capabilities!: AttractapCapabilities;
  static readonly responseFields: ResponseFields = {
    name: null,
    variant: null,
    version: null,
    capabilities: () => AttractapCapabilities,
  };
}

export class Attractap {
  @ApiProperty({ description: 'The ID of the reader' })
  id!: number;

  @ApiProperty({ description: 'The name of the reader' })
  name!: string;

  @Exclude()
  apiTokenHash!: string;

  @ApiProperty({ description: 'The resources that the reader has access to', type: () => Resource, isArray: true })
  resources!: Resource[];

  @ApiProperty({ description: 'The last time the reader connected to the server' })
  lastConnection!: Date;

  @ApiProperty({ description: 'The first time the reader connected to the server' })
  firstConnection!: Date;

  @ApiProperty({
    description: 'Global LED brightness for the reader (0-255)',
    example: 255,
    default: 255,
    minimum: 0,
    maximum: 255,
  })
  ledBrightness!: number;

  @ApiProperty({ description: 'The firmware of the reader', type: () => AttractapFirmwareVersion })
  firmware!: AttractapFirmwareVersion;
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    resources: () => Resource,
    lastConnection: null,
    firstConnection: null,
    ledBrightness: null,
    firmware: () => AttractapFirmwareVersion,
  };
}
