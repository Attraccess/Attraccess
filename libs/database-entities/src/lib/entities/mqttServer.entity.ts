import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

@Entity()
export class MqttServer {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the MQTT server',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Friendly name for the MQTT server',
    example: 'Workshop MQTT Server',
  })
  name!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'MQTT server hostname/IP',
    example: 'mqtt.example.com',
  })
  host!: string;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'MQTT server port (default: 1883 for MQTT, 8883 for MQTTS)',
    example: 1883,
  })
  port!: number;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'Optional authentication username',
    example: 'mqttuser',
    required: false,
  })
  username!: string | null;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'Optional authentication password',
    example: 'password123',
    required: false,
    writeOnly: true,
  })
  @Exclude()
  password!: string | null;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'Client ID for MQTT connection',
    example: 'attraccess-client-1',
    required: false,
  })
  clientId!: string | null;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether to use TLS/SSL',
    example: false,
  })
  useTls!: boolean;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({
    description: 'Default QoS level for publish operations (0, 1, or 2)',
    example: 0,
  })
  defaultPublishQos!: number;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Default retain flag for publish operations',
    example: false,
  })
  defaultPublishRetain!: boolean;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({
    description: 'Default QoS level for subscribe operations (0, 1, or 2)',
    example: 0,
  })
  defaultSubscribeQos!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the MQTT server was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the MQTT server was last updated',
  })
  updatedAt!: Date;
}
