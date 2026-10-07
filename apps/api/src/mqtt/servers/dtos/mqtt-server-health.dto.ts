import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for test connection response
 */
export class TestConnectionResponseDto {
  @ApiProperty({
    description: 'Whether the connection test was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Message describing the test result',
    example: 'Connection successful',
  })
  message!: string;
}

/**
 * Health status of an MQTT server connection
 */
export class MqttHealthStatusDto {
  @ApiProperty({
    description: 'Whether the connection is healthy',
    example: true,
  })
  healthy!: boolean;

  @ApiProperty({
    description: 'Detailed health status message',
    example: 'Connected: true, Failures: 0/3, Messages: 10 sent, 0 failed',
  })
  details!: string;
}

/**
 * Connection statistics for an MQTT server
 */
export class MqttConnectionStatsDto {
  @ApiProperty({
    description: 'Number of connection attempts',
    example: 5,
  })
  connectionAttempts!: number;

  @ApiProperty({
    description: 'Number of failed connections',
    example: 1,
  })
  connectionFailures!: number;

  @ApiProperty({
    description: 'Number of successful connections',
    example: 4,
  })
  connectionSuccesses!: number;

  @ApiProperty({
    description: 'Timestamp of last successful connection',
    example: '2023-01-01T12:00:00.000Z',
    required: false,
  })
  @Type(() => Date)
  lastConnectTime?: Date;

  @ApiProperty({
    description: 'Timestamp of last disconnection',
    example: '2023-01-01T12:30:00.000Z',
    required: false,
  })
  @Type(() => Date)
  lastDisconnectTime?: Date;
}

/**
 * Message statistics for an MQTT server
 */
export class MqttMessageStatsDto {
  @ApiProperty({
    description: 'Number of successfully published messages',
    example: 42,
  })
  published!: number;

  @ApiProperty({
    description: 'Number of failed message publications',
    example: 3,
  })
  failed!: number;

  @ApiProperty({
    description: 'Timestamp of last successful message publication',
    example: '2023-01-01T12:15:00.000Z',
    required: false,
  })
  @Type(() => Date)
  lastPublishTime?: Date;

  @ApiProperty({
    description: 'Timestamp of last failed message publication',
    example: '2023-01-01T12:10:00.000Z',
    required: false,
  })
  @Type(() => Date)
  lastFailureTime?: Date;
}
