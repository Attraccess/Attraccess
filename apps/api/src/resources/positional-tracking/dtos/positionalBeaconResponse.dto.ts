import { ApiProperty } from '@nestjs/swagger';
import { BeaconType } from '@attraccess/database-entities';

export class PositionalBeaconResponseDto {
  @ApiProperty({ description: 'Beacon identifier (primary key)' })
  identifier!: string;

  @ApiProperty({ description: 'Beacon type', enum: BeaconType, enumName: 'BeaconType' })
  type!: BeaconType;
}
