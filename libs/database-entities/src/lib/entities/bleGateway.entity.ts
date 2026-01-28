import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MqttServer } from './mqttServer.entity';

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

  @CreateDateColumn()
  @ApiProperty({ description: 'When the gateway was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the gateway was last updated' })
  updatedAt!: Date;
}
