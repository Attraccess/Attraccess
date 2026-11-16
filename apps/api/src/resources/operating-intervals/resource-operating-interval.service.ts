import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { OperatingIntervalRecord } from '@attraccess/application-models';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceOperatingStateChangedEvent } from './events/resource-operating-state-changed.event';
import {
  OPERATING_TIMELINE_STORE,
  OperatingClockRegressionError,
  OperatingState,
  OperatingTimelineStore,
  OperatingTransitionProvenance,
} from './operating-timeline.port';

export type ResourceOperatingState = OperatingState;
export type { OperatingTransitionProvenance } from './operating-timeline.port';

/**
 * Writes the authoritative machine operating timeline: one interval row per operating stretch.
 *
 * RETENTION GUARANTEE (ATT-1024): interval rows are retained indefinitely. No cleanup, retention or
 * purge job may delete from `resource_operating_interval`; rows only disappear with their resource
 * (database-level ON DELETE CASCADE). Derived views must be rebuildable from this timeline forever.
 */
@Injectable()
export class ResourceOperatingIntervalService {
  private readonly transitionChains = new Map<number, Promise<unknown>>();

  constructor(
    @Inject(OPERATING_TIMELINE_STORE) private readonly timeline: OperatingTimelineStore,
    private readonly operatingMetrics: OperatingMetricsRecorder,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async transition(
    resourceId: number,
    state: ResourceOperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<OperatingIntervalRecord | null> {
    const result = await this.runSerialized(resourceId, state, provenance);

    // A null result means the resource was already in the target state (or a duplicate operating
    // transition lost the unique-index race), so the timeline still reflects `state` afterwards.
    this.operatingMetrics.recordTransition(state, result !== null);
    this.operatingMetrics.setResourceState(resourceId, state);
    if (result) {
      this.eventEmitter.emit(
        ResourceOperatingStateChangedEvent.EVENT_NAME,
        new ResourceOperatingStateChangedEvent(resourceId, state),
      );
    }
    return result;
  }

  private async runSerialized(
    resourceId: number,
    state: ResourceOperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<OperatingIntervalRecord | null> {
    const previous = this.transitionChains.get(resourceId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.record(resourceId, state, provenance));
    this.transitionChains.set(resourceId, next);

    try {
      return await next;
    } finally {
      if (this.transitionChains.get(resourceId) === next) {
        this.transitionChains.delete(resourceId);
      }
    }
  }

  private async record(
    resourceId: number,
    state: ResourceOperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<OperatingIntervalRecord | null> {
    try {
      return await this.timeline.recordTransition(resourceId, state, provenance);
    } catch (error) {
      if (error instanceof OperatingClockRegressionError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
