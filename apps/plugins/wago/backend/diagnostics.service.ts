import { Inject, Injectable } from '@nestjs/common';
import { type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoDiagnosticsServiceGetOperation } from './diagnostics.service.wago-diagnostics-service-get-operation';

@Injectable()
export class WagoDiagnosticsService extends WagoDiagnosticsServiceGetOperation {
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) context: PluginContext,
    @Inject(WagoService) wago: WagoService,
  ) {
    super(context, wago);
  }
}

export { diagnosticReferences } from './diagnostics.helpers';
