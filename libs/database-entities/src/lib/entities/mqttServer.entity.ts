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

  // ponytail: CA certs are public material, so no EncryptionService round-trip like `password`.
  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'Optional PEM-encoded CA certificate used to verify the broker (for private/self-signed CAs)',
    example: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    required: false,
  })
  caCert!: string | null;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Skip TLS certificate verification for this server. Unsafe - only for trusted networks.',
    example: false,
  })
  tlsInsecure!: boolean;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({
    description: 'Optional TLS SNI/hostname to verify against, for brokers reached by IP',
    example: 'mqtt.example.com',
    required: false,
  })
  tlsServername!: string | null;

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
