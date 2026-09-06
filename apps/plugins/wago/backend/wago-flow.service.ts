import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PluginContext, PluginMqttSubscription, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import type { WagoConfigurationSnapshot } from './configuration';
import { operationalWildcardTopic, parseOperationalMessage, type WagoOperationalMessage } from './protocol';
import { WagoSettings } from './wago-settings.entity';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
const STALE_AFTER_MS = 90_000;
const MAX_CACHE_ENTRIES = 2_000;
const MAX_PENDING_DISPATCHES = 100;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_RETIRED_STREAMS = 128;

type CachedState = {
  controllerId: number;
  hardwareId: string;
  channelId: string;
  category: WagoOperationalMessage['category'];
  value: unknown;
  timestamp: string;
  sequence: number;
  streamId: string;
  unit?: string;
  kind?: 'live' | 'cumulative';
  revision?: number | null;
  contentHash?: string | null;
  receivedAt: number;
  offline?: boolean;
  invalidated?: boolean;
};
type NodeKind = 'event' | 'read' | 'wait';
type Waiter = (state?: CachedState, cancel?: boolean) => void;

@Injectable()
export class WagoFlowService implements OnModuleInit, OnModuleDestroy {
  // Plugin registration precedes the host datasource; resolve repositories only when used.
  private get controllers(): Repository<WagoController> {
    return this.context.getRepository(WagoController);
  }
  private get revisions(): Repository<WagoConfigurationRevision> {
    return this.context.getRepository(WagoConfigurationRevision);
  }
  private get settings(): Repository<WagoSettings> {
    return this.context.getRepository(WagoSettings);
  }
  private readonly cache = new Map<string, CachedState>();
  private controllerByHardwareId = new Map<string, { controller: WagoController; serverId: number }>();
  private readonly streams = new Map<
    number,
    {
      active: string;
      latestSourceTime: number;
      sampleNotBefore: number;
      stateTimestamp?: number;
      exhausted?: boolean;
      retired: Set<string>;
      sequences: Map<WagoOperationalMessage['category'], number>;
    }
  >();
  private readonly offlineControllers = new Set<number>();
  private readonly unavailableHardware = new Set<number>();
  private readonly unavailableConfiguration = new Set<number>();
  private readonly appliedConfigurations = new Map<number, { revision: number; contentHash: string }>();
  private readonly channelCache = new Map<number, WagoConfigurationSnapshot['logicalChannels']>();
  private readonly waiters = new Set<Waiter>();
  private readonly waitersByKey = new Map<string, Set<Waiter>>();
  private readonly subscriptions: PluginMqttSubscription[] = [];
  private readonly dispatches: Array<{ state: CachedState; previous?: CachedState }> = [];
  private readonly lastDispatchAtByNode = new Map<string, number>();
  private dispatching = false;
  private readonly controllerMessages = new Map<string, Promise<void>>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    // Claims and settings are managed by another service; periodically reconcile this shared subscription.
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) =>
          this.context.logger.warn(`Could not refresh WAGO flow subscriptions: ${String(error)}`),
        ),
      60_000,
    );
  }
  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.waiters.forEach((wake) => wake(undefined, true));
    this.waiters.clear();
    this.waitersByKey.clear();
  }

  async refresh(): Promise<void> {
    const settings = await this.settings.findOneBy({ id: 1 });
    if (!settings) return;
    const controllers = await this.controllers.find({ where: { trustState: 'claimed' } });
    const controllerIds = new Set(controllers.map((controller) => controller.id));
    for (const id of this.offlineControllers) if (!controllerIds.has(id)) this.offlineControllers.delete(id);
    for (const id of this.unavailableHardware) if (!controllerIds.has(id)) this.unavailableHardware.delete(id);
    for (const id of this.unavailableConfiguration)
      if (!controllerIds.has(id)) this.unavailableConfiguration.delete(id);
    for (const id of this.appliedConfigurations.keys())
      if (!controllerIds.has(id)) this.appliedConfigurations.delete(id);
    for (const id of this.streams.keys()) if (!controllerIds.has(id)) this.streams.delete(id);
    this.channelCache.clear();
    const revisions = await this.loadLatestAppliedRevisions(controllers.map((controller) => controller.id));
    for (const revision of revisions) this.cacheChannels(revision);
    for (const controller of controllers)
      if (!this.channelCache.has(controller.id)) this.channelCache.set(controller.id, []);
    const validChannels = new Map(
      controllers.map((controller) => [
        controller.id,
        new Set((this.channelCache.get(controller.id) ?? []).map((channel) => channel.id)),
      ]),
    );
    for (const [key, state] of this.cache)
      if (!validChannels.get(state.controllerId)?.has(state.channelId)) this.cache.delete(key);
    const serverIds = new Set(
      controllers
        .map((controller) => controller.mqttServerId ?? settings.defaultMqttServerId)
        .filter(Boolean) as number[],
    );
    const controllerByHardwareId = new Map(
      controllers
        .map(
          (controller) =>
            [
              controller.hardwareId,
              { controller, serverId: controller.mqttServerId ?? settings.defaultMqttServerId },
            ] as const,
        )
        .filter(([, entry]) => Boolean(entry.serverId)),
    );
    const replacements: PluginMqttSubscription[] = [];
    try {
      for (const serverId of serverIds)
        replacements.push(
          await this.context.mqtt.subscribe(serverId, operationalWildcardTopic(settings.operationalPrefix), (message) =>
            this.onMessage(serverId, settings.operationalPrefix, message.topic, message.payload),
          ),
        );
    } catch (error) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      throw error;
    }
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.push(...replacements);
    this.controllerByHardwareId = controllerByHardwareId;
  }

  async resolveConfigSchema(config: Record<string, unknown>, kind: NodeKind): Promise<Record<string, unknown>> {
    const controllers = await this.controllers.find({ where: { trustState: 'claimed' }, order: { name: 'ASC' } });
    const selected =
      typeof config.controllerId === 'number'
        ? controllers.find((controller) => controller.id === config.controllerId)
        : undefined;
    const channels = selected ? await this.channels(selected.id) : [];
    const channel = channels.find((item) => item.id === config.channelId);
    const properties: Record<string, unknown> = {
      controllerId: {
        type: 'number',
        title: 'Controller',
        refreshesSchema: true,
        oneOf: controllers.map((controller) => ({
          const: controller.id,
          title: controller.name ?? controller.hardwareId,
        })),
      },
      channelId: {
        type: 'string',
        title: 'Logical Channel',
        refreshesSchema: true,
        oneOf: channels.map((channel) => ({ const: channel.id, title: channel.id })),
      },
    };
    if (kind === 'event') {
      properties.category = {
        type: 'string',
        title: 'Event category',
        oneOf: this.categories(channel).map((category) => ({ const: category, title: category })),
      };
      properties.minimumIntervalMs = { type: 'number', title: 'Minimum interval (ms)', minimum: 0 };
      if (channel?.capabilities.includes('measurement'))
        properties.minimumChange = { type: 'number', title: 'Minimum change (wire units)', minimum: 0 };
    }
    if (kind !== 'event')
      properties.category = {
        type: 'string',
        title: 'State category',
        refreshesSchema: true,
        oneOf: this.readCategories(channel).map((category) => ({ const: category, title: category })),
      };
    if (kind === 'wait') {
      properties.equals = {
        type: config.category === 'measurement' ? 'number' : 'boolean',
        title: config.category === 'measurement' ? 'Equals (wire value)' : 'Equals',
      };
      properties.timeoutMs = { type: 'number', title: 'Timeout (ms)', minimum: 1, maximum: MAX_TIMEOUT_MS };
    }
    return { dynamic: true, type: 'object', properties, required: ['controllerId', 'channelId', 'category'] };
  }

  read(config: Record<string, unknown>): CachedState | null {
    if (typeof config.controllerId !== 'number' || typeof config.channelId !== 'string') return null;
    if (typeof config.category === 'string')
      return this.cache.get(this.cacheKey(config.controllerId, config.channelId, config.category)) ?? null;
    const entries = [...this.cache.values()].filter(
      (state) =>
        state.controllerId === config.controllerId &&
        state.channelId === config.channelId &&
        (!config.category || state.category === config.category),
    );
    return entries.sort((left, right) => right.receivedAt - left.receivedAt)[0] ?? null;
  }
  async wait(config: Record<string, unknown>): Promise<CachedState | null> {
    if (
      typeof config.controllerId !== 'number' ||
      typeof config.channelId !== 'string' ||
      typeof config.category !== 'string'
    )
      return null;
    const current = this.read(config);
    if (current && this.matchesCondition(current, config)) return current;
    const timeoutMs =
      typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? Math.min(config.timeoutMs, MAX_TIMEOUT_MS)
        : 30_000;
    const waiterKey = this.cacheKey(config.controllerId, config.channelId, config.category);
    return new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        const waiters = this.waitersByKey.get(waiterKey);
        waiters?.delete(wake);
        if (!waiters?.size) this.waitersByKey.delete(waiterKey);
      };
      const wake: Waiter = (state, cancel = false) => {
        if (!cancel && (!state || !this.matchesCondition(state, config))) return;
        cleanup();
        resolve(cancel ? null : state);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);
      this.waiters.add(wake);
      const waiters = this.waitersByKey.get(waiterKey) ?? new Set<Waiter>();
      waiters.add(wake);
      this.waitersByKey.set(waiterKey, waiters);
    });
  }

  private async onMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    // MQTT callbacks are concurrent. Serialize all categories for a controller before resolving configuration.
    const key = `${serverId}:${topic.slice(0, topic.lastIndexOf('/'))}`;
    const previous = this.controllerMessages.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.processMessage(serverId, prefix, topic, payload));
    this.controllerMessages.set(key, current);
    try {
      await current;
    } finally {
      if (this.controllerMessages.get(key) === current) this.controllerMessages.delete(key);
    }
  }

  private async processMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
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
    if (eventTime > Date.now()) {
      this.context.logger.warn(`Ignoring future-dated WAGO event for ${controller.hardwareId}`);
      return;
    }
    // Resolve configuration before mutating stream/cache state, then process the entire snapshot atomically.
    const channels = await this.channels(controller.id);
    let stream = this.streams.get(controller.id);
    if (stream?.exhausted) return;
    if (!stream || stream.active !== event.streamId) {
      if (
        event.category !== 'state' ||
        stream?.retired.has(event.streamId) ||
        (stream &&
          (!event.connected || Date.now() - eventTime > STALE_AFTER_MS || eventTime <= stream.latestSourceTime))
      ) {
        this.context.logger.warn(`Ignoring unestablished or retired WAGO stream for ${controller.hardwareId}`);
        return;
      }
      if (stream && stream.retired.size >= MAX_RETIRED_STREAMS) {
        stream.exhausted = true;
        for (const state of this.cache.values()) if (state.controllerId === controller.id) state.invalidated = true;
        this.context.logger.warn(
          `WAGO stream history exhausted for ${controller.hardwareId}; refusing further samples`,
        );
        return;
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
      return;
    }
    if (previous !== undefined && event.sequence > previous + 1)
      this.context.logger.warn(
        `WAGO event sequence gap for ${controller.hardwareId}: ${previous} to ${event.sequence}`,
      );
    stream.sequences.set(event.category, event.sequence);
    stream.latestSourceTime = Math.max(stream.latestSourceTime, eventTime);
    if (event.category === 'state') {
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
      if (
        wasUnavailable ||
        !event.connected ||
        this.unavailableHardware.has(controller.id) ||
        this.unavailableConfiguration.has(controller.id)
      )
        stream.sampleNotBefore = Math.max(stream.sampleNotBefore, eventTime);
      // A state message is a complete snapshot. Missing values are unavailable, never held as current.
      for (const state of this.cache.values()) {
        if (state.controllerId !== controller.id) continue;
        if (
          wasUnavailable ||
          !event.connected ||
          this.unavailableHardware.has(controller.id) ||
          this.unavailableConfiguration.has(controller.id) ||
          state.category === 'state'
        )
          state.invalidated = true;
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
    } else if ('channelId' in event) {
      const channel = channels.find((channel) => channel.id === event.channelId);
      if (!channel || (event.category === 'measurement' && !channel.capabilities.includes('measurement'))) return;
      this.store(controller, event.channelId, event, event.category === 'measurement' ? event.value : event);
    }
  }
  private store(controller: WagoController, channelId: string, event: WagoOperationalMessage, value: unknown): void {
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
  private async channels(controllerId: number): Promise<WagoConfigurationSnapshot['logicalChannels']> {
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
  private async loadLatestAppliedRevisions(controllerIds: number[]): Promise<WagoConfigurationRevision[]> {
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
  private cacheChannels(revision: WagoConfigurationRevision): WagoConfigurationSnapshot['logicalChannels'] {
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
  private cacheKey(controllerId: number, channelId: string, category: string): string {
    return `${controllerId}:${channelId}:${category}`;
  }
  private categories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
      'fault',
    ];
  }
  private readCategories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
    ];
  }
  private matchesEvent(
    config: Record<string, unknown>,
    nodeId: string,
    state: CachedState,
    previous?: CachedState,
  ): boolean {
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
  private matchesCondition(state: CachedState, config: Record<string, unknown>): boolean {
    return this.freshness(state).available && (config.equals === undefined || state.value === config.equals);
  }
  private freshness(state: CachedState): {
    stale: boolean;
    offline: boolean;
    connectionStale: boolean;
    available: boolean;
  } {
    const age = Date.now() - Date.parse(state.timestamp);
    const stale = !Number.isFinite(age) || age < 0 || age > STALE_AFTER_MS;
    const offline = state.offline === true || this.offlineControllers.has(state.controllerId);
    const stream = this.streams.get(state.controllerId);
    const stateTimestamp = stream?.stateTimestamp;
    const connectionStale = stateTimestamp === undefined || Date.now() - stateTimestamp > STALE_AFTER_MS;
    return {
      stale,
      offline,
      connectionStale,
      available:
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
  payload(state: CachedState): object {
    const payload = { ...state };
    delete payload.invalidated;
    return { ...payload, ...this.freshness(state) };
  }
  private async dispatch(): Promise<void> {
    this.dispatching = true;
    while (this.dispatches.length) {
      const dispatch = this.dispatches.shift();
      if (!dispatch) continue;
      const { state, previous } = dispatch;
      const stream = this.streams.get(state.controllerId);
      if (stream?.active !== state.streamId || stream.exhausted) continue;
      try {
        await this.context.flows.trigger(
          'plugin.wago.event-received',
          (config, nodeId) => this.matchesEvent(config, nodeId, state, previous),
          { wago: this.payload(state) },
        );
      } catch (error) {
        this.context.logger.warn(`Could not trigger WAGO flows: ${String(error)}`);
      }
    }
    this.dispatching = false;
  }
}
