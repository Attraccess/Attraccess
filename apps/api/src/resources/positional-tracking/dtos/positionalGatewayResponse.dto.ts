import { ApiProperty } from '@nestjs/swagger';
import { BleGatewayType } from '@attraccess/database-entities';

class GatewayCoordinatesDto {
  @ApiProperty({ description: 'Gateway X coordinate (meters)', required: false })
  x!: number | null;

  @ApiProperty({ description: 'Gateway Y coordinate (meters)', required: false })
  y!: number | null;
}

class GatewayCalibrationDto {
  @ApiProperty({ description: 'Calibrated RSSI at 1 meter (dBm)', required: false })
  txPowerAt1m!: number | null;

  @ApiProperty({ description: 'Path-loss exponent for the environment', required: false })
  pathLossExponent!: number | null;

  @ApiProperty({ description: 'When calibration was last updated', required: false, format: 'date-time' })
  calibrationUpdatedAt!: string | null;
}

export class PositionalGatewayResponseDto {
  @ApiProperty({ description: 'The unique identifier of the BLE gateway' })
  id!: number;

  @ApiProperty({ description: 'Gateway identifier as reported by the device' })
  identifier!: string;

  @ApiProperty({ description: 'Gateway type', enum: BleGatewayType, enumName: 'BleGatewayType' })
  type!: BleGatewayType;

  @ApiProperty({ description: 'MQTT server ID for subscriptions' })
  mqttServerId!: number;

  @ApiProperty({ description: 'MQTT topic to subscribe to', required: false })
  topic!: string | null;

  @ApiProperty({ description: 'Optional MQTT QoS', required: false })
  subscribeQos!: number | null;

  @ApiProperty({ description: 'Gateway coordinates', type: () => GatewayCoordinatesDto })
  coordinates!: GatewayCoordinatesDto;

  @ApiProperty({ description: 'Gateway calibration parameters', type: () => GatewayCalibrationDto })
  calibration!: GatewayCalibrationDto;
}
