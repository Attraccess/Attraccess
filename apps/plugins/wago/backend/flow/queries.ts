import { CachedState, Waiter, NodeKind } from './model';

import { MAX_TIMEOUT_MS } from './model';

import { type WagoConfigurationSnapshot } from '../configuration/model';

import { wagoFlowPreview } from './preview';

import { type PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';

import { operationalWildcardTopic } from '../protocol/index';

import { FlowSubscriptionError } from './model';

import { WagoFlowServiceState } from './state';

export abstract class WagoFlowQueries extends WagoFlowServiceState {
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

  async validateConfig(config: Record<string, unknown>, kind: NodeKind, context = new Map<string, unknown>()) {
    const schema = await this.resolveConfigSchema(config, kind, context);
    const properties = schema.properties as Record<string, { oneOf?: Array<{ const: unknown }> }>;
    const errors: Array<{ field: string; message: string }> = [];
    for (const [field, message] of [
      ['controllerId', 'Select a claimed WAGO controller.'],
      ['channelId', 'Select a channel from the applied controller configuration.'],
      ['category', 'Select a category supported by this channel.'],
    ]) {
      if (!properties[field]?.oneOf?.some((choice) => choice.const === config[field])) errors.push({ field, message });
    }
    const numericFields =
      kind === 'event' ? ['minimumIntervalMs', 'minimumChange'] : kind === 'wait' ? ['timeoutMs'] : [];
    for (const field of numericFields) {
      const value = config[field];
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < (field === 'timeoutMs' ? 1 : 0) ||
          (field === 'timeoutMs' && value > MAX_TIMEOUT_MS))
      )
        errors.push({
          field,
          message: field === 'timeoutMs' ? 'Enter a valid positive timeout.' : 'Enter a non-negative number.',
        });
    }
    if (
      kind === 'wait' &&
      (config.category === 'measurement'
        ? typeof config.equals !== 'number' || !Number.isFinite(config.equals)
        : typeof config.equals !== 'boolean')
    )
      errors.push({ field: 'equals', message: 'Enter a matching value for the selected state category.' });
    return errors;
  }

  protected cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
    if (!context.has(key)) context.set(key, load());
    return context.get(key) as Promise<T>;
  }

  async resolveConfigSchema(
    config: Record<string, unknown>,
    kind: NodeKind,
    validationContext = new Map<string, unknown>(),
    previewOnly = false,
  ): Promise<Record<string, unknown>> {
    const controllerCacheKey = previewOnly
      ? `wago-flow-controllers:preview:${config.controllerId}`
      : 'wago-flow-controllers';
    const controllers = await this.cached(validationContext, controllerCacheKey, () =>
      previewOnly && typeof config.controllerId !== 'number'
        ? Promise.resolve([])
        : this.controllers.find({
            where: { trustState: 'claimed', ...(previewOnly ? { id: config.controllerId as number } : {}) },
            order: { name: 'ASC' },
          }),
    );
    const selected =
      typeof config.controllerId === 'number'
        ? controllers.find((controller) => controller.id === config.controllerId)
        : undefined;
    const revision = selected
      ? await this.cached(validationContext, `wago-applied-revision:${selected.id}`, async () => {
          const [latest] = await this.revisions.find({
            where: { controllerId: selected.id, state: 'applied' },
            order: { revision: 'DESC' },
            take: 1,
          });
          return latest ?? null;
        })
      : null;
    const snapshot: WagoConfigurationSnapshot | null = revision ? JSON.parse(revision.snapshot) : null;
    const channels = snapshot?.logicalChannels ?? [];
    let names: Record<string, unknown> = {};
    try {
      names = JSON.parse(revision?.presetProvenance ?? 'null')?.editor?.names ?? {};
    } catch {
      // Older configurations may not have visual editor labels.
    }
    if (previewOnly)
      return {
        dynamic: true,
        type: 'object',
        properties: {},
        preview: wagoFlowPreview(config, kind, selected, snapshot, names),
      };
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
        description:
          selected && !revision ? 'Publish a configuration and wait for the controller to apply it first.' : undefined,
      },
      channelId: {
        type: 'string',
        title: 'Logical Channel',
        refreshesSchema: true,
        oneOf: channels.map((channel) => ({
          const: channel.id,
          title: typeof names[channel.id] === 'string' ? names[channel.id] : channel.id,
        })),
      },
    };
    if (kind === 'event') {
      properties.category = {
        type: 'string',
        title: 'Event category',
        oneOf: this.categories(channel).map((category) => ({ const: category, title: category })),
      };
      properties.minimumIntervalMs = { type: 'number', title: 'Minimum interval (ms)', minimum: 0, default: 0 };
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
      properties.timeoutMs = {
        type: 'number',
        title: 'Timeout (ms)',
        minimum: 1,
        maximum: MAX_TIMEOUT_MS,
        default: 30_000,
      };
    }
    return {
      dynamic: true,
      type: 'object',
      preview: wagoFlowPreview(config, kind, selected, snapshot, names),
      properties,
      required: ['controllerId', 'channelId', 'category', ...(kind === 'wait' ? ['equals', 'timeoutMs'] : [])],
    };
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
    const wildcardTopic = operationalWildcardTopic(settings.operationalPrefix);
    const replacements: PluginMqttSubscription[] = [];
    try {
      for (const serverId of serverIds)
        replacements.push(
          await this.context.mqtt.subscribe(serverId, wildcardTopic, (message) =>
            this.onMessage(serverId, settings.operationalPrefix, message.topic, message.payload),
          ),
        );
    } catch (error) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      throw new FlowSubscriptionError(error);
    }
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.push(...replacements);
    this.controllerByHardwareId = controllerByHardwareId;
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    this.waiters.forEach((wake) => wake(undefined, true));
    this.waiters.clear();
    this.waitersByKey.clear();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      if (!(error instanceof FlowSubscriptionError)) throw error;
      this.context.logger.warn(`Could not refresh WAGO flow subscriptions during startup: ${String(error.mqttError)}`);
    }
    // Claims and settings are managed by another service; periodically reconcile this shared subscription.
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) =>
          this.context.logger.warn(`Could not refresh WAGO flow subscriptions: ${String(error)}`),
        ),
      60_000,
    );
  }
}
