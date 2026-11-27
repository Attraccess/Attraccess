import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  FlowLogRecordingDto,
  RECORDING_WINDOW_MINUTES,
  ResourceFlowLog,
  ResourceFlowLogType,
  ResourceFlowLogsResponseDto,
} from '../dto/flow-log.dto';

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

/** Newest entries win once the buffer is full. */
const MAX_ENTRIES_PER_RECORDING = 2000;
const MAX_PAYLOAD_CHARS = 8000;
const SWEEP_INTERVAL_MS = 10_000;

/** Recordings are keyed by the resource id of a resource flow or by `globalFlowLogKey` of a global flow. */
export type FlowLogKey = number | string;

export function globalFlowLogKey(flowId: number): string {
  return `flow:${flowId}`;
}

export interface FlowLogInput {
  flowRunId: string;
  nodeId: string | null;
  /** The resource of a resource flow; null for global-flow nodes. */
  resourceId: number | null;
  /** The global flow of a global-flow node; null for resource-flow nodes. */
  flowId?: number | null;
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
 * while someone works in the flow editor (the editor keeps the recording alive
 * with `keepAlive`), held in memory, and thrown away when the recording
 * expires {@link RECORDING_WINDOW_MINUTES} after the last renewal. Nothing reaches the database — one chatty
 * MQTT device used to write ~2M rows/day through the database.
 */
@Injectable()
export class FlowLogRecorderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlowLogRecorderService.name);
  private readonly recordings = new Map<FlowLogKey, Recording>();
  private readonly subjects = new Map<FlowLogKey, Subject<ResourceFlowLogEvent>>();
  private sweepInterval?: NodeJS.Timeout;
  // Seeded from the clock so ids keep increasing across API restarts: an open editor keeps the entries it
  // received before a restart, and the log viewer de-duplicates and orders entries by id.
  private nextId = Date.now();

  onModuleInit() {
    // Doubles as SSE keep-alive and expiry sweep.
    this.sweepInterval = setInterval(() => {
      this.subjects.forEach((subject) => subject.next({ data: { keepalive: true } }));
      this.recordings.forEach((recording, key) => {
        if (recording.expiresAt.getTime() <= Date.now()) {
          this.expire(key);
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

  /**
   * Starts a recording when none is active, otherwise only extends it. A renewal
   * never shortens a recording and never touches its start time or collected logs.
   */
  public keepAlive(key: FlowLogKey): FlowLogRecordingDto {
    const now = Date.now();
    const windowEnd = new Date(now + RECORDING_WINDOW_MINUTES * 60_000);
    const recording = this.activeRecording(key);

    if (!recording) {
      this.recordings.set(key, { startedAt: new Date(now), expiresAt: windowEnd, logs: [] });
      this.logger.log(`Recording flow logs for ${key} until ${windowEnd.toISOString()}`);
    } else if (windowEnd.getTime() > recording.expiresAt.getTime()) {
      recording.expiresAt = windowEnd;
      this.logger.verbose(`Extended flow log recording for ${key} until ${windowEnd.toISOString()}`);
    }

    return this.getStatus(key);
  }

  public getStatus(key: FlowLogKey): FlowLogRecordingDto {
    const recording = this.activeRecording(key);

    return {
      isRecording: !!recording,
      startedAt: recording?.startedAt ?? null,
      expiresAt: recording?.expiresAt ?? null,
    };
  }

  public getLogs(key: FlowLogKey): ResourceFlowLogsResponseDto {
    const recording = this.activeRecording(key);

    return {
      recording: {
        isRecording: !!recording,
        startedAt: recording?.startedAt ?? null,
        expiresAt: recording?.expiresAt ?? null,
      },
      logs: recording?.logs ?? [],
    };
  }

  public isRecording(key: FlowLogKey): boolean {
    return !!this.activeRecording(key);
  }

  /** No-op unless a recording is active for the resource. Never throws. */
  public record(input: FlowLogInput): void {
    const key = input.flowId != null ? globalFlowLogKey(input.flowId) : input.resourceId;
    if (key === null) {
      return;
    }
    const recording = this.activeRecording(key);
    if (!recording) {
      return;
    }

    const log: ResourceFlowLog = {
      id: this.nextId++,
      flowRunId: input.flowRunId,
      nodeId: input.nodeId,
      resourceId: input.resourceId,
      flowId: input.flowId ?? null,
      type: input.type,
      payload: this.serializePayload(input.payload),
      createdAt: new Date(),
    };

    recording.logs.push(log);
    if (recording.logs.length > MAX_ENTRIES_PER_RECORDING) {
      recording.logs.shift();
    }

    this.subjects.get(key)?.next({ data: log });
  }

  public subjectFor(key: FlowLogKey): Subject<ResourceFlowLogEvent> {
    let subject = this.subjects.get(key);
    if (!subject) {
      subject = new Subject<ResourceFlowLogEvent>();
      this.subjects.set(key, subject);
    }
    return subject;
  }

  public releaseSubject(key: FlowLogKey): void {
    const subject = this.subjects.get(key);
    if (subject && !subject.observed) {
      this.subjects.delete(key);
    }
  }

  private activeRecording(key: FlowLogKey): Recording | undefined {
    const recording = this.recordings.get(key);
    if (!recording) {
      return undefined;
    }

    if (recording.expiresAt.getTime() <= Date.now()) {
      this.expire(key);
      return undefined;
    }

    return recording;
  }

  private expire(key: FlowLogKey): void {
    if (this.recordings.delete(key)) {
      this.logger.log(`Flow log recording for ${key} expired, collected logs discarded`);
    }
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
      return serialized.length > MAX_PAYLOAD_CHARS
        ? `${serialized.slice(0, MAX_PAYLOAD_CHARS)}…[truncated]`
        : serialized;
    } catch (error) {
      this.logger.debug(`Failed to serialize flow log payload: ${error.message}`);
      return undefined;
    }
  }
}
