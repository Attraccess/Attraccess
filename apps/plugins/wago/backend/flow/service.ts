import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { type PluginContext } from '@attraccess/plugins-backend-sdk';

import { WagoService } from '../controllers/service';

import {
  PLUGIN_CONTEXT,
  STALE_AFTER_MS,
  MAX_CACHE_ENTRIES,
  MAX_PENDING_DISPATCHES,
  MAX_RETIRED_STREAMS,
} from './model';

import { WAGO_EVENT_NODE_TYPE } from './state-nodes';

import { CachedState, OperationalStream } from './model';

import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../../shared/clock';

import { type WagoConfigurationSnapshot } from '../configuration/model';

import { WagoConfigurationRevision } from '../configuration/revision.entity';

import { WagoController } from '../controllers/entity';

import { type WagoOperationalMessage, parseOperationalMessage } from '../protocol/index';

import { WagoFlowQueries } from './queries';

@Injectable()
export class WagoFlowService extends WagoFlowQueries implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PLUGIN_CONTEXT) context: PluginContext, @Inject(WagoService) wago?: WagoService) {
    super(context, wago);
  }

  protected async dispatch(): Promise<void> {
    this.dispatching = true;
    while (this.dispatches.length) {
      const dispatch = this.dispatches.shift();
      if (!dispatch) continue;
      const { state, previous } = dispatch;
      const stream = this.streams.get(state.controllerId);
      if (stream?.active !== state.streamId || stream.exhausted) continue;
      try {
        await this.context.flows.trigger(
          WAGO_EVENT_NODE_TYPE,
          (config, nodeId) => this.matchesEvent(config, nodeId, state, previous),
          { wago: this.payload(state) },
        );
      } catch (error) {
        this.context.logger.warn(`Could not trigger WAGO flows: ${String(error)}`);
      }
    }
    this.dispatching = false;
  }

  payload(state: CachedState) {
    const payload = { ...state };
    delete payload.invalidated;
    return { ...payload, ...this.freshness(state) };
  }

  protected freshness(state: CachedState): {
    stale: boolean;
    offline: boolean;
    connectionStale: boolean;
    available: boolean;
  } {
    const age = Date.now() - Date.parse(state.timestamp);
    const stale = !Number.isFinite(age) || age < -CONTROLLER_CLOCK_TOLERANCE_MS || age > STALE_AFTER_MS;
    const offline = state.offline === true || this.offlineControllers.has(state.controllerId);
    const stream = this.streams.get(state.controllerId);
    const stateTimestamp = stream?.stateTimestamp;
    const connectionAge = stateTimestamp === undefined ? NaN : Date.now() - stateTimestamp;
    const connectionStale =
      !Number.isFinite(connectionAge) ||
      connectionAge < -CONTROLLER_CLOCK_TOLERANCE_MS ||
      connectionAge > STALE_AFTER_MS;
    return {
      stale,
      offline,
      connectionStale,
      available:
        !this.wago?.isRuntimeUpdateRequired(state.controllerId) &&
        !stale &&
        !offline &&
        !connectionStale &&
        stream?.active === state.streamId &&
        !stream.exhausted &&
        Date.parse(state.timestamp) >= stream.sampleNotBefore &&
        !state.invalidated &&
        !this.unavailableHardware.has(state.controllerId) &&
        !this.unavailableConfiguration.has(state.controllerId),
    };
  }

  protected matchesCondition(state: CachedState, config: Record<string, unknown>): boolean {
    return this.freshness(state).available && (config.equals === undefined || state.value === config.equals);
  }

  protected matchesEvent(
    config: Record<string, unknown>,
    nodeId: string,
    state: CachedState,
    previous?: CachedState,
  ): boolean {
    if (this.wago?.isRuntimeUpdateRequired(state.controllerId)) return false;
    if (
      config.controllerId !== state.controllerId ||
      config.channelId !== state.channelId ||
      config.category !== state.category
    )
      return false;
    if (
      typeof config.minimumChange === 'number' &&
      typeof state.value === 'number' &&
      typeof previous?.value === 'number' &&
      previous.streamId === state.streamId &&
      previous.unit === state.unit &&
      previous.kind === state.kind &&
      Math.abs(state.value - previous.value) < config.minimumChange
    )
      return false;
    if (typeof config.minimumIntervalMs === 'number') {
      const lastDispatchAt = this.lastDispatchAtByNode.get(nodeId);
      if (lastDispatchAt !== undefined && state.receivedAt - lastDispatchAt < config.minimumIntervalMs) return false;
      this.lastDispatchAtByNode.set(nodeId, state.receivedAt);
    }
    return true;
  }

  protected readCategories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
    ];
  }

  protected categories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
      'fault',
    ];
  }

  protected cacheKey(controllerId: number, channelId: string, category: string): string {
    return `${controllerId}:${channelId}:${category}`;
  }

  protected cacheChannels(revision: WagoConfigurationRevision): WagoConfigurationSnapshot['logicalChannels'] {
    try {
      const channels = (JSON.parse(revision.snapshot) as WagoConfigurationSnapshot).logicalChannels;
      const previous = this.appliedConfigurations.get(revision.controllerId);
      if (previous?.revision !== revision.revision || previous?.contentHash !== revision.contentHash) {
        this.unavailableConfiguration.add(revision.controllerId);
        for (const state of this.cache.values())
          if (state.controllerId === revision.controllerId) state.invalidated = true;
      }
      this.appliedConfigurations.set(revision.controllerId, {
        revision: revision.revision,
        contentHash: revision.contentHash,
      });
      this.channelCache.set(revision.controllerId, channels);
      return channels;
    } catch {
      this.channelCache.set(revision.controllerId, []);
      return [];
    }
  }

  protected async loadLatestAppliedRevisions(controllerIds: number[]): Promise<WagoConfigurationRevision[]> {
    if (!controllerIds.length) return [];
    return this.revisions
      .createQueryBuilder('revision')
      .innerJoin(
        (query) =>
          query
            .subQuery()
            .select('latest.controllerId', 'controllerId')
            .addSelect('MAX(latest.revision)', 'revision')
            .from(WagoConfigurationRevision, 'latest')
            .where('latest.controllerId IN (:...controllerIds)', { controllerIds })
            .andWhere('latest.state = :state', { state: 'applied' })
            .groupBy('latest.controllerId'),
        'latest',
        'latest.controllerId = revision.controllerId AND latest.revision = revision.revision',
      )
      .where('revision.state = :state', { state: 'applied' })
      .getMany();
  }

  protected async channels(controllerId: number): Promise<WagoConfigurationSnapshot['logicalChannels']> {
    const cached = this.channelCache.get(controllerId);
    if (cached) return cached;
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    if (!revision) {
      this.channelCache.set(controllerId, []);
      return [];
    }
    return this.cacheChannels(revision);
  }

  protected store(controller: WagoController, channelId: string, event: WagoOperationalMessage, value: unknown): void {
    const state: CachedState = {
      controllerId: controller.id,
      hardwareId: controller.hardwareId,
      channelId,
      category: event.category,
      value,
      timestamp: event.timestamp,
      sequence: event.sequence,
      streamId: event.streamId,
      ...(event.category === 'measurement' ? { unit: event.unit, kind: event.kind } : {}),
      ...(event.category === 'state' ? { revision: event.revision, contentHash: event.contentHash } : {}),
      receivedAt: Date.now(),
      offline: this.offlineControllers.has(controller.id),
      invalidated:
        this.unavailableHardware.has(controller.id) ||
        this.unavailableConfiguration.has(controller.id) ||
        Date.parse(event.timestamp) < (this.streams.get(controller.id)?.sampleNotBefore ?? 0),
    };
    const cacheKey = this.cacheKey(controller.id, channelId, event.category);
    const previous = this.cache.get(cacheKey);
    this.cache.set(cacheKey, state);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.waitersByKey.get(cacheKey)?.forEach((wake) => wake(state));
    if (this.dispatches.length >= MAX_PENDING_DISPATCHES) {
      this.context.logger.warn(`Dropping excess WAGO flow dispatch for ${controller.hardwareId}`);
      return;
    }
    this.dispatches.push({ state, previous });
    if (!this.dispatching) void this.dispatch();
  }

  protected applyState(
    controller: WagoController,
    event: Extract<WagoOperationalMessage, { category: 'state' }>,
    eventTime: number,
    stream: OperationalStream,
    channels: WagoConfigurationSnapshot['logicalChannels'],
  ): void {
    const wasUnavailable =
      this.offlineControllers.has(controller.id) ||
      this.unavailableHardware.has(controller.id) ||
      this.unavailableConfiguration.has(controller.id) ||
      (stream.stateTimestamp !== undefined && Date.now() - stream.stateTimestamp > STALE_AFTER_MS);
    stream.stateTimestamp = eventTime;
    if (event.connected) this.offlineControllers.delete(controller.id);
    else this.offlineControllers.add(controller.id);
    if (event.readiness?.hardwareAvailable === false) this.unavailableHardware.add(controller.id);
    else if (event.readiness?.hardwareAvailable === true) this.unavailableHardware.delete(controller.id);
    const applied = this.appliedConfigurations.get(controller.id);
    if (applied && event.revision === applied.revision && event.contentHash === applied.contentHash)
      this.unavailableConfiguration.delete(controller.id);
    else this.unavailableConfiguration.add(controller.id);
    const invalidateSamples =
      wasUnavailable ||
      !event.connected ||
      this.unavailableHardware.has(controller.id) ||
      this.unavailableConfiguration.has(controller.id);
    if (invalidateSamples) stream.sampleNotBefore = Math.max(stream.sampleNotBefore, eventTime);
    // A state message is a complete snapshot. Missing values are unavailable, never held as current.
    for (const state of this.cache.values()) {
      if (state.controllerId !== controller.id) continue;
      if (invalidateSamples || state.category === 'state') state.invalidated = true;
    }
    for (const channel of channels) {
      const value =
        channel.capabilities.includes('input') && Object.hasOwn(event.inputs ?? {}, channel.id)
          ? event.inputs[channel.id]
          : channel.capabilities.includes('output') && Object.hasOwn(event.outputs, channel.id)
            ? event.outputs[channel.id]
            : undefined;
      if (typeof value === 'boolean') this.store(controller, channel.id, event, value);
    }
  }

  protected admitEvent(
    controller: WagoController,
    event: WagoOperationalMessage,
    eventTime: number,
  ): OperationalStream | undefined {
    let stream = this.streams.get(controller.id);
    if (stream?.exhausted) return undefined;
    if (!stream || stream.active !== event.streamId) {
      if (
        event.category !== 'state' ||
        stream?.retired.has(event.streamId) ||
        (stream &&
          (!event.connected || Date.now() - eventTime > STALE_AFTER_MS || eventTime <= stream.latestSourceTime))
      ) {
        this.context.logger.warn(`Ignoring unestablished or retired WAGO stream for ${controller.hardwareId}`);
        return undefined;
      }
      if (stream && stream.retired.size >= MAX_RETIRED_STREAMS) {
        stream.exhausted = true;
        for (const state of this.cache.values()) if (state.controllerId === controller.id) state.invalidated = true;
        this.context.logger.warn(
          `WAGO stream history exhausted for ${controller.hardwareId}; refusing further samples`,
        );
        return undefined;
      }
      const retired = stream?.retired ?? new Set<string>();
      if (stream) retired.add(stream.active);
      stream = {
        active: event.streamId,
        latestSourceTime: eventTime,
        sampleNotBefore: eventTime,
        retired,
        sequences: new Map(),
      };
      this.streams.set(controller.id, stream);
      for (const state of this.cache.values()) if (state.controllerId === controller.id) state.invalidated = true;
    }
    const previous = stream.sequences.get(event.category);
    if (previous !== undefined && event.sequence <= previous) {
      this.context.logger.warn(`Ignoring duplicate or out-of-order WAGO event for ${controller.hardwareId}`);
      return undefined;
    }
    if (previous !== undefined && event.sequence > previous + 1)
      this.context.logger.warn(
        `WAGO event sequence gap for ${controller.hardwareId}: ${previous} to ${event.sequence}`,
      );
    stream.sequences.set(event.category, event.sequence);
    stream.latestSourceTime = Math.max(stream.latestSourceTime, eventTime);
    return stream;
  }

  protected async processMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    let parsed: ReturnType<typeof parseOperationalMessage>;
    try {
      parsed = parseOperationalMessage(prefix, topic, payload);
    } catch (error) {
      this.context.logger.warn(`Ignoring invalid WAGO event: ${String(error)}`);
      return;
    }
    if (!parsed) return;
    const { hardwareId, message: event } = parsed;
    const entry = this.controllerByHardwareId.get(hardwareId);
    if (!entry || entry.serverId !== serverId) return;
    const { controller } = entry;
    const eventTime = Date.parse(event.timestamp);
    if (eventTime > Date.now() + CONTROLLER_CLOCK_TOLERANCE_MS) {
      this.context.logger.warn(`Ignoring WAGO event beyond the clock-skew tolerance for ${controller.hardwareId}`);
      return;
    }
    // Resolve configuration before mutating stream/cache state, then process the entire snapshot atomically.
    const channels = await this.channels(controller.id);
    const stream = this.admitEvent(controller, event, eventTime);
    if (!stream) return;
    if (event.category === 'state') {
      this.applyState(controller, event, eventTime, stream, channels);
    } else if ('channelId' in event) {
      const channel = channels.find((channel) => channel.id === event.channelId);
      if (!channel || (event.category === 'measurement' && !channel.capabilities.includes('measurement'))) return;
      this.store(controller, event.channelId, event, event.category === 'measurement' ? event.value : event);
    }
  }

  protected onMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    const queued = this.messageQueue
      .catch(() => undefined)
      .then(() => this.processMessage(serverId, prefix, topic, payload));
    this.messageQueue = queued;
    return queued;
  }
}
