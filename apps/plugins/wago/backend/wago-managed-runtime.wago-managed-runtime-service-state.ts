import { Inject } from '@nestjs/common';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Repository } from '@attraccess/plugins-backend-sdk';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoRuntimeUpdateEntity } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { RuntimeUpdateFailure } from './wago-runtime-update';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoService } from './wago.service';
import { DiagnosticStream } from './diagnostics-envelope';
import { RootAcceptance } from './wago-managed-runtime.contracts';
import { RootProbe } from './wago-managed-runtime.contracts';
import { LiveHeartbeat } from './wago-managed-runtime.contracts';
import { ManagementSetup } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceOnApplicationBootstrapContract } from './wago-managed-runtime.wago-managed-runtime-service-on-application-bootstrap-contract';

export abstract class WagoManagedRuntimeServiceState extends WagoManagedRuntimeServiceOnApplicationBootstrapContract {
  protected access!: Repository<WagoManagedAccess>;

  protected updates!: Repository<WagoRuntimeUpdateEntity>;

  protected sessions!: Repository<WagoCommissioningSession>;

  protected controllers!: Repository<WagoController>;

  protected operations!: WagoDeviceOperations;

  protected coordinator!: WagoRuntimeUpdateCoordinator;

  protected readonly heartbeats = new Map<number, LiveHeartbeat>();

  protected readonly heartbeatStreams = new Map<number, DiagnosticStream>();

  protected readonly runtimeActivations = new Map<
    string,
    { imageId: string; startedAt: number; previousStreamId?: string }
  >();

  protected readonly verifyingControllers = new Set<number>();

  protected readonly connectingControllers = new Set<number>();

  protected readonly reconciliationFailures = new Map<number, RuntimeUpdateFailure>();

  protected readonly enrolmentProgress = new Map<number, ManagementSetup>();

  protected timer?: ReturnType<typeof setInterval>;

  protected destroyed = false;

  protected scanning = false;

  protected nextScanAt = 0;

  protected rootProbe?: RootProbe;

  protected rootAcceptance?: RootAcceptance;

  protected retirementProbe?: RootProbe;

  protected readonly connections = new Set<AbortController>();

  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago: WagoService,
    @Inject(WagoRuntimeArtifactsService) protected readonly artifacts: WagoRuntimeArtifactsService,
    @Inject(WagoCommissioningReadiness) protected readonly readiness: WagoCommissioningReadiness,
  ) {
    super();
  }
}
