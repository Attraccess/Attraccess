import { ApiProperty } from '@nestjs/swagger';
import type { UsageSession } from '@attraccess/application-models';
import { ResourceUsageResponseDto } from './resource-usage-response.dto';

export class GetActiveUsageSessionDto {
  @ApiProperty({
    description: "The caller's own active usage session, otherwise the newest active session, or null if none exists",
    type: () => ResourceUsageResponseDto,
    nullable: true,
  })
  usage: UsageSession | null;

  @ApiProperty({
    description: 'All active usage sessions of the resource, earliest started first',
    type: () => ResourceUsageResponseDto,
    isArray: true,
  })
  usages: UsageSession[];

  @ApiProperty({ description: 'Number of active usage sessions', example: 1 })
  activeSessionCount: number;

  @ApiProperty({ description: 'Maximum number of parallel sessions of the resource', example: 1 })
  maxParallelSessions: number;

  @ApiProperty({ description: 'Whether no further session can be started', example: false })
  isFull: boolean;
}
