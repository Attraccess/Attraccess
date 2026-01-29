import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MqttServer } from './mqttServer.entity';

export class GatewayCoordinates {
  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Gateway X coordinate (meters)', required: false })
  x!: number | null;

  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Gateway Y coordinate (meters)', required: false })
  y!: number | null;
}

export class GatewayCalibration {
  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Calibrated RSSI at 1 meter (dBm)', required: false })
  txPowerAt1m!: number | null;

  @Column({ type: 'real', nullable: true })
  @ApiProperty({ description: 'Path-loss exponent for the environment', required: false })
  pathLossExponent!: number | null;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({ description: 'When calibration was last updated', required: false })
  calibrationUpdatedAt!: Date | null;
}

@Entity()
export class BleGateway {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the BLE gateway' })
  id!: number;

  @Column({ type: 'text', unique: true })
  @ApiProperty({ description: 'Gateway identifier as reported by the device' })
  identifier!: string;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'MQTT server ID for subscriptions' })
  mqttServerId!: number;

  @ManyToOne(() => MqttServer, { onDelete: 'CASCADE' })
  @ApiProperty({ description: 'MQTT server for this gateway', type: () => MqttServer })
  mqttServer!: MqttServer;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'MQTT topic to subscribe to for this gateway' })
  topic!: string;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Optional MQTT QoS', required: false })
  subscribeQos!: number | null;

  @Column(() => GatewayCoordinates, { prefix: '' })
  @ApiProperty({ description: 'Gateway coordinates', type: () => GatewayCoordinates })
  coordinates!: GatewayCoordinates;

  @Column(() => GatewayCalibration, { prefix: '' })
  @ApiProperty({ description: 'Gateway calibration parameters', type: () => GatewayCalibration })
  calibration!: GatewayCalibration;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the gateway was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the gateway was last updated' })
  updatedAt!: Date;
}
