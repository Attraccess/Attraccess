import { Inject } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoDiagnosticsServiceGetResourceContract } from './diagnostics.wago-diagnostics-service-get-resource-contract';


export abstract class WagoDiagnosticsServiceState extends WagoDiagnosticsServiceGetResourceContract {
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago: WagoService,
  ) {
    super();
  }
}
