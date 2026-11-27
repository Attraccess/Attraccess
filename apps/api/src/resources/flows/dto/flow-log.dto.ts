import { ApiProperty } from '@nestjs/swagger';

export enum ResourceFlowLogType {
  FLOW_START = 'flow.start',
  NODE_PROCESSING_STARTED = 'node.processing.started',
  NODE_PROCESSING_FAILED = 'node.processing.failed',
  NODE_PROCESSING_COMPLETED = 'node.processing.completed',
  FLOW_COMPLETED = 'flow.completed',
}

/**
 * A single flow log line. Kept in memory only, while a recording is kept
 * alive by the flow editor — flow logs are never persisted.
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

  @ApiProperty({
    description: 'The id of the resource that this log belongs to; null for logs of a global flow',
    example: 1,
    nullable: true,
    type: Number,
  })
  resourceId!: number | null;

  @ApiProperty({
    description: 'The id of the global flow that this log belongs to; null for logs of a resource flow',
    example: 1,
    nullable: true,
    type: Number,
  })
  flowId!: number | null;
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
    description:
      'When the recording stops automatically and all collected logs are discarded, unless the flow editor renews it before',
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

/** A keep-alive extends a recording to this many minutes from now. */
export const RECORDING_WINDOW_MINUTES = 15;
