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

type CachedState = { controllerId: number; hardwareId: string; channelId: string; category: WagoOperationalMessage['category']; value: unknown; timestamp: string; sequence: number; receivedAt: number };
type NodeKind = 'event' | 'read' | 'wait';

@Injectable()
export class WagoFlowService implements OnModuleInit, OnModuleDestroy {
  private readonly controllers: Repository<WagoController>;
  private readonly revisions: Repository<WagoConfigurationRevision>;
  private readonly settings: Repository<WagoSettings>;
  private readonly cache = new Map<string, CachedState>();
  private controllerByHardwareId = new Map<string, { controller: WagoController; serverId: number }>();
  private readonly sequences = new Map<number, number>();
  private readonly sequenceTimestamps = new Map<number, number>();
  private readonly channelCache = new Map<number, WagoConfigurationSnapshot['logicalChannels']>();
  private readonly waiters = new Set<(cancel?: boolean) => void>();
  private readonly subscriptions: PluginMqttSubscription[] = [];
  private readonly dispatches: Array<{ state: CachedState; previous?: CachedState }> = [];
  private readonly lastDispatchAtByNode = new Map<string, number>();
  private dispatching = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {
    this.controllers = context.getRepository(WagoController);
    this.revisions = context.getRepository(WagoConfigurationRevision);
    this.settings = context.getRepository(WagoSettings);
  }

  async onModuleInit(): Promise<void> {
    await this.refresh();
    // Claims and settings are managed by another service; periodically reconcile this shared subscription.
    this.refreshTimer = setInterval(() => void this.refresh().catch((error) => this.context.logger.warn(`Could not refresh WAGO flow subscriptions: ${String(error)}`)), 60_000);
  }
  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.waiters.forEach((wake) => wake(true));
    this.waiters.clear();
  }

  async refresh(): Promise<void> {
    const settings = await this.settings.findOneBy({ id: 1 });
    if (!settings) return;
    const controllers = await this.controllers.find({ where: { trustState: 'claimed' } });
    this.channelCache.clear();
    const revisions = await this.loadLatestAppliedRevisions(controllers.map((controller) => controller.id));
    for (const revision of revisions) this.cacheChannels(revision);
    for (const controller of controllers)
      if (!this.channelCache.has(controller.id)) this.channelCache.set(controller.id, []);
    const validChannels = new Map(
      controllers.map((controller) => [controller.id, new Set((this.channelCache.get(controller.id) ?? []).map((channel) => channel.id))]),
    );
    for (const [key, state] of this.cache)
      if (!validChannels.get(state.controllerId)?.has(state.channelId)) this.cache.delete(key);
    const serverIds = new Set(controllers.map((controller) => controller.mqttServerId ?? settings.defaultMqttServerId).filter(Boolean) as number[]);
    const controllerByHardwareId = new Map(
      controllers
        .map((controller) => [controller.hardwareId, { controller, serverId: controller.mqttServerId ?? settings.defaultMqttServerId }] as const)
        .filter(([, entry]) => Boolean(entry.serverId)),
    );
    const replacements: PluginMqttSubscription[] = [];
    try {
      for (const serverId of serverIds)
        replacements.push(await this.context.mqtt.subscribe(serverId, operationalWildcardTopic(settings.operationalPrefix), (message) => this.onMessage(serverId, settings.operationalPrefix, message.topic, message.payload)));
    } catch (error) { replacements.forEach((subscription) => subscription.unsubscribe()); throw error; }
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.push(...replacements);
    this.controllerByHardwareId = controllerByHardwareId;
  }

  async resolveConfigSchema(config: Record<string, unknown>, kind: NodeKind): Promise<Record<string, unknown>> {
    const controllers = await this.controllers.find({ where: { trustState: 'claimed' }, order: { name: 'ASC' } });
    const selected = typeof config.controllerId === 'number' ? controllers.find((controller) => controller.id === config.controllerId) : undefined;
    const channels = selected ? await this.channels(selected.id) : [];
    const channel = channels.find((item) => item.id === config.channelId);
    const properties: Record<string, unknown> = {
        controllerId: { type: 'number', title: 'Controller', refreshesSchema: true, oneOf: controllers.map((controller) => ({ const: controller.id, title: controller.name ?? controller.hardwareId })) },
        channelId: { type: 'string', title: 'Logical Channel', refreshesSchema: true, oneOf: channels.map((channel) => ({ const: channel.id, title: channel.id })) },
    };
    if (kind === 'event') {
      properties.category = { type: 'string', title: 'Event category', oneOf: this.categories(channel).map((category) => ({ const: category, title: category })) };
      properties.minimumIntervalMs = { type: 'number', title: 'Minimum interval (ms)', minimum: 0 };
      if (channel?.capabilities.includes('measurement')) properties.minimumChange = { type: 'number', title: 'Minimum change', minimum: 0 };
    }
    if (kind !== 'event')
      properties.category = { type: 'string', title: 'State category', refreshesSchema: true, oneOf: this.readCategories(channel).map((category) => ({ const: category, title: category })) };
    if (kind === 'wait') {
      properties.equals = { type: config.category === 'measurement' ? 'number' : 'boolean', title: 'Equals' };
      properties.timeoutMs = { type: 'number', title: 'Timeout (ms)', minimum: 1, maximum: MAX_TIMEOUT_MS };
    }
    return { dynamic: true, type: 'object', properties, required: ['controllerId', 'channelId', 'category'] };
  }

  read(config: Record<string, unknown>): CachedState | null {
    if (typeof config.controllerId !== 'number' || typeof config.channelId !== 'string') return null;
    const entries = [...this.cache.values()].filter((state) => state.controllerId === config.controllerId && state.channelId === config.channelId && (!config.category || state.category === config.category));
    return entries.sort((left, right) => right.sequence - left.sequence)[0] ?? null;
  }
  async wait(config: Record<string, unknown>): Promise<CachedState | null> {
    const current = this.read(config);
    if (current && this.matchesCondition(current, config)) return current;
    const timeoutMs = typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? Math.min(config.timeoutMs, MAX_TIMEOUT_MS)
      : 30_000;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.waiters.delete(wake); resolve(null); }, timeoutMs);
      const wake = (cancel = false) => {
        const state = this.read(config);
        if (!cancel && (!state || !this.matchesCondition(state, config))) return;
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve(cancel ? null : state);
      };
      this.waiters.add(wake);
    });
  }

  private async onMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    let parsed;
    try { parsed = parseOperationalMessage(prefix, topic, payload); } catch (error) { this.context.logger.warn(`Ignoring invalid WAGO event: ${String(error)}`); return; }
    if (!parsed) return;
    const { hardwareId, message: event } = parsed;
    const entry = this.controllerByHardwareId.get(hardwareId);
    if (!entry || entry.serverId !== serverId) return;
    const { controller } = entry;
    const previous = this.sequences.get(controller.id);
    const eventTime = Date.parse(event.timestamp);
    const previousTime = this.sequenceTimestamps.get(controller.id);
    if (previous !== undefined && event.sequence <= previous && (!previousTime || eventTime <= previousTime)) { this.context.logger.warn(`Ignoring duplicate or out-of-order WAGO event for ${controller.hardwareId}`); return; }
    if (previous !== undefined && event.sequence <= previous) this.context.logger.warn(`Resetting WAGO event sequence after controller reconnect for ${controller.hardwareId}`);
    if (previous !== undefined && event.sequence > previous + 1) this.context.logger.warn(`WAGO event sequence gap for ${controller.hardwareId}: ${previous} to ${event.sequence}`);
    this.sequences.set(controller.id, event.sequence);
    this.sequenceTimestamps.set(controller.id, eventTime);
    const channelId = event.category === 'state' ? null : 'channelId' in event ? event.channelId : null;
    if (event.category === 'state') for (const [id, value] of Object.entries(event.outputs)) await this.store(controller, id, event, value);
    else if (channelId) await this.store(controller, channelId, event, event.category === 'measurement' ? event.value : event);
  }
  private async store(controller: WagoController, channelId: string, event: WagoOperationalMessage, value: unknown): Promise<void> {
    if (!(await this.channels(controller.id)).some((channel) => channel.id === channelId)) return;
    const state: CachedState = { controllerId: controller.id, hardwareId: controller.hardwareId, channelId, category: event.category, value, timestamp: event.timestamp, sequence: event.sequence, receivedAt: Date.now() };
    const cacheKey = `${controller.id}:${channelId}:${event.category}`;
    const previous = this.cache.get(cacheKey);
    this.cache.set(cacheKey, state);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.waiters.forEach((wake) => wake());
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
    const [revision] = await this.revisions.find({ where: { controllerId, state: 'applied' }, order: { revision: 'DESC' }, take: 1 });
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
        (query) => query
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
      this.channelCache.set(revision.controllerId, channels);
      return channels;
    } catch {
      this.channelCache.set(revision.controllerId, []);
      return [];
    }
  }
  private categories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] { return ['state', ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []), 'fault']; }
  private readCategories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] { return ['state', ...(channel?.capabilities.includes('measurement') ? ['measurement'] : [])]; }
  private matchesEvent(config: Record<string, unknown>, nodeId: string, state: CachedState, previous?: CachedState): boolean {
    if (config.controllerId !== state.controllerId || config.channelId !== state.channelId || config.category !== state.category) return false;
    if (typeof config.minimumChange === 'number' && typeof state.value === 'number' && typeof previous?.value === 'number' && Math.abs(state.value - previous.value) < config.minimumChange) return false;
    if (typeof config.minimumIntervalMs === 'number') {
      const lastDispatchAt = this.lastDispatchAtByNode.get(nodeId);
      if (lastDispatchAt !== undefined && state.receivedAt - lastDispatchAt < config.minimumIntervalMs) return false;
      this.lastDispatchAtByNode.set(nodeId, state.receivedAt);
    }
    return true;
  }
  private matchesCondition(state: CachedState, config: Record<string, unknown>): boolean { return config.equals === undefined || state.value === config.equals; }
  payload(state: CachedState): object { return { ...state, stale: Date.now() - Date.parse(state.timestamp) > STALE_AFTER_MS }; }
  private async dispatch(): Promise<void> {
    this.dispatching = true;
    while (this.dispatches.length) {
      const dispatch = this.dispatches.shift();
      if (!dispatch) continue;
      const { state, previous } = dispatch;
      try { await this.context.flows.trigger('plugin.wago.event-received', (config, nodeId) => this.matchesEvent(config, nodeId, state, previous), { wago: this.payload(state) }); }
      catch (error) { this.context.logger.warn(`Could not trigger WAGO flows: ${String(error)}`); }
    }
    this.dispatching = false;
  }
}
