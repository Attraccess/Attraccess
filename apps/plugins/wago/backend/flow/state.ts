import { type PluginMqttSubscription, type PluginContext, type Repository } from '@attraccess/plugins-backend-sdk';

import { Inject } from '@nestjs/common';

import { WagoConfigurationRevision } from '../configuration/revision.entity';

import { WagoController } from '../controllers/entity';

import { WagoService } from '../controllers/service';

import { type WagoConfigurationSnapshot } from '../configuration/model';

import { WagoSettings } from '../controllers/settings.entity';

import { PLUGIN_CONTEXT } from './model';

import { CachedState, Waiter, OperationalStream, NodeKind } from './model';

import { type WagoOperationalMessage } from '../protocol/index';

export abstract class WagoFlowServiceState {
  constructor(
    @Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago?: WagoService,
  ) {}

  protected readonly cache = new Map<string, CachedState>();

  protected controllerByHardwareId = new Map<string, { controller: WagoController; serverId: number }>();

  protected readonly streams = new Map<number, OperationalStream>();

  protected readonly offlineControllers = new Set<number>();

  protected readonly unavailableHardware = new Set<number>();

  protected readonly unavailableConfiguration = new Set<number>();

  protected readonly appliedConfigurations = new Map<number, { revision: number; contentHash: string }>();

  protected readonly channelCache = new Map<number, WagoConfigurationSnapshot['logicalChannels']>();

  protected readonly waiters = new Set<Waiter>();

  protected readonly waitersByKey = new Map<string, Set<Waiter>>();

  protected readonly subscriptions: PluginMqttSubscription[] = [];

  protected readonly dispatches: Array<{ state: CachedState; previous?: CachedState }> = [];

  protected readonly lastDispatchAtByNode = new Map<string, number>();

  protected dispatching = false;

  protected messageQueue: Promise<void> = Promise.resolve();

  protected refreshTimer: ReturnType<typeof setInterval> | null = null;

  // Plugin registration precedes the host datasource; resolve repositories only when used.
  protected get controllers(): Repository<WagoController> {
    return this.context.getRepository(WagoController);
  }

  protected get revisions(): Repository<WagoConfigurationRevision> {
    return this.context.getRepository(WagoConfigurationRevision);
  }

  protected get settings(): Repository<WagoSettings> {
    return this.context.getRepository(WagoSettings);
  }

  abstract onModuleInit(): Promise<void>;

  abstract onModuleDestroy(): void;

  abstract refresh(): Promise<void>;

  abstract resolveConfigSchema(
    config: Record<string, unknown>,
    kind: NodeKind,
    validationContext?: Map<string, unknown>,
    previewOnly?: boolean,
  ): Promise<Record<string, unknown>>;

  protected abstract cached<T>(context: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T>;

  abstract validateConfig(
    config: Record<string, unknown>,
    kind: NodeKind,
    context?: Map<string, unknown>,
  ): Promise<{ field: string; message: string }[]>;

  abstract read(config: Record<string, unknown>): CachedState | null;

  abstract wait(config: Record<string, unknown>): Promise<CachedState | null>;

  protected abstract onMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void>;

  protected abstract processMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void>;

  protected abstract admitEvent(
    controller: WagoController,
    event: WagoOperationalMessage,
    eventTime: number,
  ): OperationalStream | undefined;

  protected abstract applyState(
    controller: WagoController,
    event: Extract<WagoOperationalMessage, { category: 'state' }>,
    eventTime: number,
    stream: OperationalStream,
    channels: WagoConfigurationSnapshot['logicalChannels'],
  ): void;

  protected abstract store(
    controller: WagoController,
    channelId: string,
    event: WagoOperationalMessage,
    value: unknown,
  ): void;

  protected abstract channels(controllerId: number): Promise<WagoConfigurationSnapshot['logicalChannels']>;

  protected abstract loadLatestAppliedRevisions(controllerIds: number[]): Promise<WagoConfigurationRevision[]>;

  protected abstract cacheChannels(revision: WagoConfigurationRevision): WagoConfigurationSnapshot['logicalChannels'];

  protected abstract cacheKey(controllerId: number, channelId: string, category: string): string;

  protected abstract categories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[];

  protected abstract readCategories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[];

  protected abstract matchesEvent(
    config: Record<string, unknown>,
    nodeId: string,
    state: CachedState,
    previous?: CachedState,
  ): boolean;

  protected abstract matchesCondition(state: CachedState, config: Record<string, unknown>): boolean;

  protected abstract freshness(state: CachedState): {
    stale: boolean;
    offline: boolean;
    connectionStale: boolean;
    available: boolean;
  };

  abstract payload(state: CachedState): {
    stale: boolean;
    offline: boolean;
    connectionStale: boolean;
    available: boolean;
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
    invalidated?: boolean;
  };

  protected abstract dispatch(): Promise<void>;
}
