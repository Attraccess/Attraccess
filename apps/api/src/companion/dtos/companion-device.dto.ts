import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { CompanionDeviceRecord, CompanionDeviceResource } from '@attraccess/application-models';

export class CompanionDeviceResourceDto {
  @ApiProperty({ description: 'The ID of the resource' })
  id!: number;

  @ApiProperty({ description: 'The name of the resource' })
  name!: string;
}

/** Keeps the published schema name of the entity this DTO replaced, so the generated client is unchanged. */
@ApiSchema({ name: 'CompanionDevice' })
export class CompanionDeviceDto {
  @ApiProperty({ description: 'The ID of the companion device' })
  id!: number;

  @ApiProperty({ description: 'The display name of the companion device' })
  name!: string;

  @ApiProperty({ description: 'Resources this device controls', type: () => CompanionDeviceResourceDto, isArray: true })
  resources!: CompanionDeviceResource[];

  @ApiProperty({ description: 'Whether this device is currently locked (persisted so a restart re-locks)' })
  locked!: boolean;

  @ApiProperty({ description: 'Last time this device connected' })
  lastConnection!: Date;

  @ApiProperty({ description: 'First time this device connected' })
  firstConnection!: Date;

  @ApiProperty({ description: 'App version reported by this device on last connect', nullable: true })
  appVersion!: string | null;
}

@ApiSchema({ name: 'CompanionDeviceDetailDto' })
export class CompanionDeviceDetailDto extends CompanionDeviceDto {
  @ApiProperty({ description: 'Whether the device currently has an open connection' })
  connected!: boolean;
}

/** Explicit mapping: the token hash never leaves the service. */
export function toCompanionDeviceDto(device: CompanionDeviceRecord): CompanionDeviceDto {
  return {
    id: device.id,
    name: device.name,
    resources: device.resources,
    locked: device.locked,
    lastConnection: device.lastConnection,
    firstConnection: device.firstConnection,
    appVersion: device.appVersion,
  };
}
