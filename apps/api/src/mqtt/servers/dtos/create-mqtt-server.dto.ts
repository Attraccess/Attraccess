import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ToBoolean } from '../../../common/request-transformers';

/**
 * DTO for creating a new MQTT server
 */
export class CreateMqttServerDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Friendly name for the MQTT server' })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Hostname or IP address of the MQTT server' })
  host!: string;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({ description: 'Port number of the MQTT server', example: 1883 })
  port!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @ApiProperty({
    description: 'Optional management API port on the broker host. Null uses the provider default.',
    type: 'integer',
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 65535,
    example: 25671,
  })
  managementPort?: number | null;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional username for authentication',
    required: false,
  })
  username?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional password for authentication',
    required: false,
  })
  password?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional client ID for MQTT connection',
    required: false,
  })
  clientId?: string;

  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to use TLS/SSL for the connection',
    required: false,
    default: false,
  })
  useTls?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'PEM-encoded CA certificate used to verify the broker (for private/self-signed CAs)',
    required: false,
  })
  caCert?: string;

  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Skip TLS certificate verification for this server. Unsafe - only for trusted networks.',
    required: false,
    default: false,
  })
  tlsInsecure?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'TLS SNI/hostname to verify against, for brokers reached by IP',
    required: false,
  })
  tlsServername?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1, 2])
  @ApiProperty({
    description: 'Default publish QoS (0, 1, or 2)',
    required: false,
    example: 0,
  })
  defaultPublishQos?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty({
    description: 'Default publish retain flag',
    required: false,
    example: false,
  })
  defaultPublishRetain?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1, 2])
  @ApiProperty({
    description: 'Default subscribe QoS (0, 1, or 2)',
    required: false,
    example: 0,
  })
  defaultSubscribeQos?: number;
}
