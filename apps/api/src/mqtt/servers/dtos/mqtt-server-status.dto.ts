import { ApiProperty } from '@nestjs/swagger';
import { MqttConnectionStatsDto, MqttHealthStatusDto, MqttMessageStatsDto } from './mqtt-server-health.dto';

/**
 * Combined statistics for an MQTT server
 */
export class MqttServerStatsDto {
  @ApiProperty({
    description: 'Connection statistics',
    type: () => MqttConnectionStatsDto,
  })
  connection!: MqttConnectionStatsDto;

  @ApiProperty({
    description: 'Message statistics',
    type: () => MqttMessageStatsDto,
  })
  messages!: MqttMessageStatsDto;
}

/**
 * Complete status of an MQTT server
 */
export class MqttServerStatusDto {
  @ApiProperty({
    description: 'Whether the server is currently connected',
    example: true,
  })
  connected!: boolean;

  @ApiProperty({
    description: 'Health status of the connection',
    type: () => MqttHealthStatusDto,
  })
  healthStatus!: MqttHealthStatusDto;

  @ApiProperty({
    description: 'Detailed statistics',
    type: () => MqttServerStatsDto,
  })
  stats!: MqttServerStatsDto;
}

/**
 * Response for getting all server statuses
 */
export class AllMqttServerStatusesDto {
  @ApiProperty({
    description: 'Map of server IDs to their statuses',
    type: 'object',
    additionalProperties: {
      type: 'object',
      $ref: '#/components/schemas/MqttServerStatusDto',
    },
  })
  servers: Record<string, MqttServerStatusDto> = {};
}
