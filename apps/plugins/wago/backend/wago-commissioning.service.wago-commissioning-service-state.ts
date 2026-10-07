import {
  Inject,
  Optional,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService, WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import { WagoManagementService } from './wago-management';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoCommissioningServiceOnApplicationBootstrapContract } from "./wago-commissioning.service.wago-commissioning-service-on-application-bootstrap-contract";
export abstract class WagoCommissioningServiceState extends WagoCommissioningServiceOnApplicationBootstrapContract {

  protected sessions!: Repository<WagoCommissioningSession>;

  protected management!: WagoManagementService;

  protected readonly operationContext = new AsyncLocalStorage<CommissioningOperationGuard>();

  protected readonly controllerLocks = new Map<string, Promise<void>>();

  protected readonly deliveryLocks = new Map<number, Promise<void>>();

  protected readonly transferWrites = new Map<number, Promise<void>>();

  protected readonly activeDeadlines = new Map<number, number>();


  constructor(
    @Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago: WagoService,
    @Optional() @Inject(WagoRuntimeArtifactsService) protected readonly artifacts?: WagoRuntimeArtifactCatalog,
    @Optional() @Inject(WagoCommissioningReadiness) protected readonly readiness?: WagoCommissioningReadiness,
    @Optional() @Inject(WagoManagedRuntimeService) protected readonly managedRuntime?: WagoManagedRuntimeService,
  ) {
      super();}
}
