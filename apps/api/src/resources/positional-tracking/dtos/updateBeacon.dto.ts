import { ApiProperty } from '@nestjs/swagger';
import { BeaconType } from '@attraccess/database-entities';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateBeaconDto {
  @ApiProperty({ description: 'Beacon type', enum: BeaconType, enumName: 'BeaconType', required: false })
  @IsEnum(BeaconType)
  @IsOptional()
  type?: BeaconType;
}
