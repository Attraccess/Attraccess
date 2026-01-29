import { ApiProperty } from '@nestjs/swagger';
import { BleGatewayType } from '@attraccess/database-entities';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
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

export class CreateGatewayDto {
  @ApiProperty({ description: 'Gateway identifier as reported by the device' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ description: 'Gateway type', enum: BleGatewayType, enumName: 'BleGatewayType' })
  @IsEnum(BleGatewayType)
  type!: BleGatewayType;

  @ApiProperty({ description: 'MQTT server ID for subscriptions' })
  @IsInt()
  mqttServerId!: number;

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
