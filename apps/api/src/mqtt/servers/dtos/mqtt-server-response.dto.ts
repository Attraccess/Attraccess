import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { MqttServerRecord } from '@attraccess/application-models';

/** An MQTT server as returned by the API. The password is never part of a response. */
@ApiSchema({ name: 'MqttServer' })
export class MqttServerDto {
  @ApiProperty({ description: 'The unique identifier of the MQTT server', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Friendly name for the MQTT server', example: 'Workshop MQTT Server' })
  name!: string;

  @ApiProperty({ description: 'MQTT server hostname/IP', example: 'mqtt.example.com' })
  host!: string;

  @ApiProperty({ description: 'MQTT server port (default: 1883 for MQTT, 8883 for MQTTS)', example: 1883 })
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

  @ApiProperty({ description: 'Optional authentication username', example: 'mqttuser', required: false })
  username!: string | null;

  @ApiProperty({ description: 'Client ID for MQTT connection', example: 'attraccess-client-1', required: false })
  clientId!: string | null;

  @ApiProperty({ description: 'Whether to use TLS/SSL', example: false })
  useTls!: boolean;

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

  @ApiProperty({ description: 'Default QoS level for publish operations (0, 1, or 2)', example: 0 })
  defaultPublishQos!: number;

  @ApiProperty({ description: 'Default retain flag for publish operations', example: false })
  defaultPublishRetain!: boolean;

  @ApiProperty({ description: 'Default QoS level for subscribe operations (0, 1, or 2)', example: 0 })
  defaultSubscribeQos!: number;

  @ApiProperty({ description: 'When the MQTT server was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the MQTT server was last updated' })
  updatedAt!: Date;
}

/** Explicit mapping: the (encrypted or decrypted) password is dropped here. */
export function toMqttServerDto(server: MqttServerRecord): MqttServerDto {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    managementPort: server.managementPort,
    username: server.username,
    clientId: server.clientId,
    useTls: server.useTls,
    caCert: server.caCert,
    tlsInsecure: server.tlsInsecure,
    tlsServername: server.tlsServername,
    defaultPublishQos: server.defaultPublishQos,
    defaultPublishRetain: server.defaultPublishRetain,
    defaultSubscribeQos: server.defaultSubscribeQos,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}
