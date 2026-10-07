import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { PLUGIN_CONTEXT } from './wago-flow.state';
import { WagoFlowServiceDispatchOperation } from './wago-flow.wago-flow-service-dispatch-operation';

@Injectable()
export class WagoFlowService extends WagoFlowServiceDispatchOperation implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PLUGIN_CONTEXT) context: PluginContext, @Inject(WagoService) wago?: WagoService) {
    super(context, wago);
  }
}
