import {
  Inject
} from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoNetworkChange } from './wago-network-change.entity';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoService } from './wago.service';
import { WagoNetworkChangeServiceOnModuleDestroyContract } from "./wago-network-change.service.wago-network-change-service-on-module-destroy-contract";
export abstract class WagoNetworkChangeServiceState extends WagoNetworkChangeServiceOnModuleDestroyContract {

  protected readonly active = new Set<AbortController>();

  protected destroyed = false;

  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) protected readonly context: PluginContext,
    @Inject(WagoManagedRuntimeService) protected readonly managed: WagoManagedRuntimeService,
    @Inject(WagoService) protected readonly wago: WagoService,
  ) {
      super();}

  protected get repository() {
    return this.context.getRepository(WagoNetworkChange);
  }
}
