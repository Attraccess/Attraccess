import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ResourceFlowLogType {
  FLOW_START = 'flow.start',
  NODE_PROCESSING_STARTED = 'node.processing.started',
  NODE_PROCESSING_FAILED = 'node.processing.failed',
  NODE_PROCESSING_COMPLETED = 'node.processing.completed',
  FLOW_COMPLETED = 'flow.completed',
}

/**
 * A single flow log line. Kept in memory only, for the duration of an
 * explicitly started recording — flow logs are never persisted.
 */
export class ResourceFlowLog {
  @ApiProperty({
    description: 'Identifier of the log entry, unique per API process',
    example: 42,
  })
  id!: number;

  @ApiProperty({
    description: 'The node id of the node that generated the log',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
    nullable: true,
  })
  nodeId!: string | null;

  @ApiProperty({
    description: 'The run/execution id of the flow that generated the log',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  flowRunId!: string;

  @ApiProperty({
    description: 'The type of the log entry',
    enum: ResourceFlowLogType,
    example: ResourceFlowLogType.NODE_PROCESSING_STARTED,
    enumName: 'ResourceFlowLogType',
  })
  type!: ResourceFlowLogType;

  @ApiProperty({
    description: 'Optional JSON payload with the node input, output or error',
    required: false,
  })
  payload?: string;

  @ApiProperty({ description: 'When the log entry was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The id of the resource that this log belongs to', example: 1 })
  resourceId!: number;
}

export class FlowLogRecordingDto {
  @ApiProperty({ description: 'Whether flow logs are currently being recorded for this resource' })
  isRecording!: boolean;

  @ApiProperty({
    description: 'When the current recording was started',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiProperty({
    description: 'When the recording stops automatically and all collected logs are discarded',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  expiresAt!: Date | null;
}

export class ResourceFlowLogsResponseDto {
  @ApiProperty({ type: FlowLogRecordingDto })
  recording!: FlowLogRecordingDto;

  @ApiProperty({ type: [ResourceFlowLog], description: 'Logs collected so far, oldest first' })
  logs!: ResourceFlowLog[];
}

export const DEFAULT_RECORDING_MINUTES = 15;
export const MAX_RECORDING_MINUTES = 24 * 60;

export class StartFlowLogRecordingDto {
  @ApiProperty({
    description: 'How long to record flow logs before stopping and discarding them',
    default: DEFAULT_RECORDING_MINUTES,
    minimum: 1,
    maximum: MAX_RECORDING_MINUTES,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RECORDING_MINUTES)
  durationMinutes: number = DEFAULT_RECORDING_MINUTES;
}
