import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { MAX_PUBLISH_PAYLOAD_BYTES, MAX_TOPIC_BYTES } from '../mqtt-explorer.constants';

/** Value rules (wildcards, byte limits) are enforced with generic errors in MqttExplorerService. */
export class PublishMqttExplorerMessageDto {
  @IsString()
  @ApiProperty({ description: `Topic to publish to: no wildcards, at most ${MAX_TOPIC_BYTES} bytes` })
  topic!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: `Message payload, at most ${MAX_PUBLISH_PAYLOAD_BYTES} bytes` })
  payload?: string;

  @IsOptional()
  @IsIn([0, 1, 2])
  @ApiPropertyOptional({ enum: [0, 1, 2], description: 'Quality of service' })
  qos?: 0 | 1 | 2;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Ask the broker to retain the message' })
  retain?: boolean;
}
