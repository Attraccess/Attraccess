import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  DEFAULT_RECORDING_MINUTES,
  FlowLogRecordingDto,
  MAX_RECORDING_MINUTES,
  ResourceFlowLog,
  ResourceFlowLogType,
  ResourceFlowLogsResponseDto,
} from './dto/flow-log.dto';

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

/** Newest entries win once the buffer is full. */
const MAX_ENTRIES_PER_RECORDING = 2000;
const MAX_PAYLOAD_CHARS = 8000;
const SWEEP_INTERVAL_MS = 10_000;

export interface FlowLogInput {
  flowRunId: string;
  nodeId: string | null;
  resourceId: number;
  type: ResourceFlowLogType;
  /** Only invoked while a recording is active, so idle flows never pay for serialization. */
  payload?: () => unknown;
}

interface Recording {
  startedAt: Date;
  expiresAt: Date;
  logs: ResourceFlowLog[];
}

/**
 * Flow logs are a debugging aid, not an audit trail: they are collected only
 * while a user explicitly records a flow, held in memory, and thrown away when
 * the recording stops or expires. Nothing reaches the database — one chatty
 * MQTT device used to write ~2M rows/day through SQLite's single connection.
 */
@Injectable()
export class FlowLogRecorderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlowLogRecorderService.name);
  private readonly recordings = new Map<number, Recording>();
  private readonly subjects = new Map<number, Subject<ResourceFlowLogEvent>>();
  private sweepInterval?: NodeJS.Timeout;
  private nextId = 1;

  onModuleInit() {
    // Doubles as SSE keep-alive and expiry sweep.
    this.sweepInterval = setInterval(() => {
      this.subjects.forEach((subject) => subject.next({ data: { keepalive: true } }));
      this.recordings.forEach((recording, resourceId) => {
        if (recording.expiresAt.getTime() <= Date.now()) {
          this.stop(resourceId);
        }
      });
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
    }
    this.subjects.forEach((subject) => subject.complete());
    this.subjects.clear();
    this.recordings.clear();
  }

  public start(resourceId: number, durationMinutes = DEFAULT_RECORDING_MINUTES): FlowLogRecordingDto {
    const minutes = Math.min(Math.max(Math.floor(durationMinutes), 1), MAX_RECORDING_MINUTES);
    const expiresAt = new Date(Date.now() + minutes * 60_000);

    // Restarting drops whatever was collected before.
    this.recordings.set(resourceId, { startedAt: new Date(), expiresAt, logs: [] });
    this.logger.log(`Recording flow logs for resource ${resourceId} until ${expiresAt.toISOString()}`);

    return this.getStatus(resourceId);
  }

  public stop(resourceId: number): FlowLogRecordingDto {
    if (this.recordings.delete(resourceId)) {
      this.logger.log(`Stopped recording flow logs for resource ${resourceId}, collected logs discarded`);
    }

    return this.getStatus(resourceId);
  }

  public getStatus(resourceId: number): FlowLogRecordingDto {
    const recording = this.activeRecording(resourceId);

    return {
      isRecording: !!recording,
      startedAt: recording?.startedAt ?? null,
      expiresAt: recording?.expiresAt ?? null,
    };
  }

  public getLogs(resourceId: number): ResourceFlowLogsResponseDto {
    const recording = this.activeRecording(resourceId);

    return {
      recording: {
        isRecording: !!recording,
        startedAt: recording?.startedAt ?? null,
        expiresAt: recording?.expiresAt ?? null,
      },
      logs: recording?.logs ?? [],
    };
  }

  public isRecording(resourceId: number): boolean {
    return !!this.activeRecording(resourceId);
  }

  /** No-op unless a recording is active for the resource. Never throws. */
  public record(input: FlowLogInput): void {
    const recording = this.activeRecording(input.resourceId);
    if (!recording) {
      return;
    }

    const log: ResourceFlowLog = {
      id: this.nextId++,
      flowRunId: input.flowRunId,
      nodeId: input.nodeId,
      resourceId: input.resourceId,
      type: input.type,
      payload: this.serializePayload(input.payload),
      createdAt: new Date(),
    };

    recording.logs.push(log);
    if (recording.logs.length > MAX_ENTRIES_PER_RECORDING) {
      recording.logs.shift();
    }

    this.subjects.get(input.resourceId)?.next({ data: log });
  }

  public subjectFor(resourceId: number): Subject<ResourceFlowLogEvent> {
    let subject = this.subjects.get(resourceId);
    if (!subject) {
      subject = new Subject<ResourceFlowLogEvent>();
      this.subjects.set(resourceId, subject);
    }
    return subject;
  }

  public releaseSubject(resourceId: number): void {
    const subject = this.subjects.get(resourceId);
    if (subject && !subject.observed) {
      this.subjects.delete(resourceId);
    }
  }

  private activeRecording(resourceId: number): Recording | undefined {
    const recording = this.recordings.get(resourceId);
    if (!recording) {
      return undefined;
    }

    if (recording.expiresAt.getTime() <= Date.now()) {
      this.stop(resourceId);
      return undefined;
    }

    return recording;
  }

  private serializePayload(payload?: () => unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    try {
      const serialized = JSON.stringify(payload());
      if (serialized === undefined) {
        return undefined;
      }
      return serialized.length > MAX_PAYLOAD_CHARS ? `${serialized.slice(0, MAX_PAYLOAD_CHARS)}…[truncated]` : serialized;
    } catch (error) {
      this.logger.debug(`Failed to serialize flow log payload: ${error.message}`);
      return undefined;
    }
  }
}
