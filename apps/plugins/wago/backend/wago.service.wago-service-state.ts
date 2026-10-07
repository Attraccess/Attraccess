import { ConflictException, Inject } from '@nestjs/common';
import { PluginContext, PluginMqttSubscription, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoCommandHandler } from './wago-command-handler';
import { WagoDiagnosticsStore } from './diagnostics-store';
import { PLUGIN_CONTEXT } from './wago.state';
import { WagoServiceConnectivityContract } from './wago.wago-service-connectivity-contract';
export abstract class WagoServiceState extends WagoServiceConnectivityContract {
  readonly diagnostics = new WagoDiagnosticsStore();

  protected controllers!: Repository<WagoController>;

  protected readonly networkSubscriptions = new Map<number, PluginMqttSubscription[]>();

  protected networkSubscriptionRevision = 0;

  protected settings!: Repository<WagoSettings>;

  protected enrollments!: Repository<WagoEnrollment>;

  protected drafts!: Repository<WagoConfigurationDraft>;

  protected revisions!: Repository<WagoConfigurationRevision>;

  protected readonly subscriptions: PluginMqttSubscription[] = [];

  protected readonly enrollmentExpiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  protected readonly claimAcknowledgementSubscriptions = new Map<number, PluginMqttSubscription>();

  protected readonly claimLocks = new Map<number, Promise<void>>();

  protected readonly configurationLocks = new Map<number, Promise<void>>();

  protected readonly configurationReportQueues = new Map<
    number,
    { pending: Map<number, Buffer>; processing: boolean }
  >();

  protected commissioningDiscoveryHandler: ((controller: WagoController) => Promise<void>) | null = null;

  protected runtimeStatusHandler:
    | ((
        id: number,
        heartbeat: {
          imageId: string;
          runtimeVersion?: string;
          streamId: string;
          timestamp: number;
          receivedAt: number;
          sequence: number;
          runtimePolicyToken?: string;
        },
      ) => void)
    | null = null;

  protected readonly runtimePolicies = new Map<
    number,
    { desired: string; observed: string; runtimePolicyToken?: string }
  >();

  protected readonly runtimeUpdateBlocks = new Set<number>();

  protected readonly commands = new WagoCommandHandler({
    context: this.context,
    controllers: () => this.controllers,
    claimedController: async (id) => {
      const controller = await this.claimedController(id);
      if (this.isRuntimeUpdateRequired(id))
        throw new ConflictException(
          'Runtime update required; outputs are held in failsafe until the server runtime is installed',
        );
      return controller;
    },
    getSettings: () => this.getSettings(),
    appliedRevision: (id) => this.appliedRevision(id),
    onCommand: (controllerId, channelId, id) => this.diagnostics.command(controllerId, channelId, id),
    onCommandFailure: (id, status) => this.diagnostics.commandFailed(id, status),
  });

  protected claimConfigurationLock = Promise.resolve();

  protected subscriptionRebuild = Promise.resolve();

  protected subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null;

  protected activeSubscriptionGeneration = 0;

  protected destroyed = false;

  constructor(@Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext) {
    super();
  }
}
