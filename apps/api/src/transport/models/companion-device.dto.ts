import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

export class CompanionDevice {
  @ApiProperty({ description: 'The ID of the companion device' })
  id!: number;

  @ApiProperty({ description: 'The display name of the companion device' })
  name!: string;

  @Exclude()
  tokenHash!: string;

  @ApiProperty({ description: 'Resources this device controls', type: () => Resource, isArray: true })
  resources!: Resource[];

  @ApiProperty({ description: 'Whether this device is currently locked (persisted so a restart re-locks)' })
  locked!: boolean;

  @ApiProperty({ description: 'Last time this device connected' })
  lastConnection!: Date;

  @ApiProperty({ description: 'First time this device connected' })
  firstConnection!: Date;

  @ApiProperty({ description: 'App version reported by this device on last connect', nullable: true })
  appVersion!: string | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    resources: () => Resource,
    locked: null,
    lastConnection: null,
    firstConnection: null,
    appVersion: null,
  };
}
