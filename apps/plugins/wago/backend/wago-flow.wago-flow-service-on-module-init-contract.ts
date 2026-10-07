import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import type { WagoConfigurationSnapshot } from './configuration';
import type { WagoOperationalMessage } from './protocol';
import { CachedState } from './wago-flow.contracts';
import { NodeKind } from './wago-flow.contracts';
import { OperationalStream } from './wago-flow.contracts';


export abstract class WagoFlowServiceOnModuleInitContract {
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
