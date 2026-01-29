import { ApiProperty } from '@nestjs/swagger';
import { BleGatewayType } from '@attraccess/database-entities';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GatewayCoordinatesDto {
  @ApiProperty({ description: 'Gateway X coordinate (meters)', required: false })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  x?: number | null;

  @ApiProperty({ description: 'Gateway Y coordinate (meters)', required: false })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsOptional()
  y?: number | null;
}

export class UpdateGatewayDto {
  @ApiProperty({ description: 'Gateway identifier as reported by the device', required: false })
  @IsString()
  @IsOptional()
  identifier?: string;

  @ApiProperty({ description: 'Gateway type', enum: BleGatewayType, enumName: 'BleGatewayType', required: false })
  @IsEnum(BleGatewayType)
  @IsOptional()
  type?: BleGatewayType;

  @ApiProperty({ description: 'MQTT server ID for subscriptions', required: false })
  @IsInt()
  @IsOptional()
  mqttServerId?: number;

  @ApiProperty({ description: 'MQTT topic to subscribe to', required: false })
  @IsString()
  @IsOptional()
  topic?: string | null;

  @ApiProperty({ description: 'Optional MQTT QoS', required: false })
  @IsInt()
  @IsOptional()
  subscribeQos?: number | null;

  @ApiProperty({ description: 'Gateway coordinates', required: false, type: () => GatewayCoordinatesDto })
  @ValidateNested()
  @Type(() => GatewayCoordinatesDto)
  @IsOptional()
  coordinates?: GatewayCoordinatesDto;
}
