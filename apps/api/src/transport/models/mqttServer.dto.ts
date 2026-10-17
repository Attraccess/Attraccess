import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import type { ResponseFields } from '../response-mapper';

export class MqttServer {
  @ApiProperty({
    description: 'The unique identifier of the MQTT server',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'Friendly name for the MQTT server',
    example: 'Workshop MQTT Server',
  })
  name!: string;

  @ApiProperty({
    description: 'MQTT server hostname/IP',
    example: 'mqtt.example.com',
  })
  host!: string;

  @ApiProperty({
    description: 'MQTT server port (default: 1883 for MQTT, 8883 for MQTTS)',
    example: 1883,
  })
  port!: number;

  @ApiProperty({
    description: 'Optional management API port on the broker host. Null uses the provider default.',
    type: 'integer',
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 65535,
    example: 25671,
  })
  managementPort!: number | null;

  @ApiProperty({
    description: 'Optional authentication username',
    example: 'mqttuser',
    required: false,
  })
  username!: string | null;

  @ApiProperty({
    description: 'Optional authentication password',
    example: 'password123',
    required: false,
    writeOnly: true,
  })
  @Exclude()
  password!: string | null;

  @ApiProperty({
    description: 'Client ID for MQTT connection',
    example: 'attraccess-client-1',
    required: false,
  })
  clientId!: string | null;

  @ApiProperty({
    description: 'Whether to use TLS/SSL',
    example: false,
  })
  useTls!: boolean;

  // ponytail: CA certs are public material, so no EncryptionService round-trip like `password`.

  @ApiProperty({
    description: 'Optional PEM-encoded CA certificate used to verify the broker (for private/self-signed CAs)',
    example: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    required: false,
  })
  caCert!: string | null;

  @ApiProperty({
    description: 'Skip TLS certificate verification for this server. Unsafe - only for trusted networks.',
    example: false,
  })
  tlsInsecure!: boolean;

  @ApiProperty({
    description: 'Optional TLS SNI/hostname to verify against, for brokers reached by IP',
    example: 'mqtt.example.com',
    required: false,
  })
  tlsServername!: string | null;

  @ApiProperty({
    description: 'Default QoS level for publish operations (0, 1, or 2)',
    example: 0,
  })
  defaultPublishQos!: number;

  @ApiProperty({
    description: 'Default retain flag for publish operations',
    example: false,
  })
  defaultPublishRetain!: boolean;

  @ApiProperty({
    description: 'Default QoS level for subscribe operations (0, 1, or 2)',
    example: 0,
  })
  defaultSubscribeQos!: number;

  @ApiProperty({
    description: 'When the MQTT server was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the MQTT server was last updated',
  })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    host: null,
    port: null,
    managementPort: null,
    username: null,
    clientId: null,
    useTls: null,
    caCert: null,
    tlsInsecure: null,
    tlsServername: null,
    defaultPublishQos: null,
    defaultPublishRetain: null,
    defaultSubscribeQos: null,
    createdAt: null,
    updatedAt: null,
  };
}
