import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { Inject } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { Repository } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoService } from './wago.service';
import type { WagoConfigurationSnapshot } from './configuration';
import { WagoSettings } from './wago-settings.entity';
import { PLUGIN_CONTEXT } from './wago-flow.state';
import { CachedState } from './wago-flow.contracts';
import { Waiter } from './wago-flow.contracts';
import { OperationalStream } from './wago-flow.contracts';
import { WagoFlowServiceOnModuleInitContract } from './wago-flow.wago-flow-service-on-module-init-contract';


export abstract class WagoFlowServiceState extends WagoFlowServiceOnModuleInitContract {
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

  constructor(
    @Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago?: WagoService,
  ) {
    super();
  }
}
