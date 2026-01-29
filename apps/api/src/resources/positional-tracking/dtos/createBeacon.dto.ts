import { ApiProperty } from '@nestjs/swagger';
import { BeaconType } from '@attraccess/database-entities';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateBeaconDto {
  @ApiProperty({ description: 'Beacon identifier (primary key)' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ description: 'Beacon type', enum: BeaconType, enumName: 'BeaconType' })
  @IsEnum(BeaconType)
  type!: BeaconType;
}
