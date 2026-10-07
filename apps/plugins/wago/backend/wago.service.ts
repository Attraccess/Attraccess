import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { PLUGIN_CONTEXT } from './wago.state';
import { WagoServiceScheduleSubscriptionRetryOperation } from './wago.wago-service-schedule-subscription-retry-operation';

@Injectable()
export class WagoService
  extends WagoServiceScheduleSubscriptionRetryOperation
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(@Inject(PLUGIN_CONTEXT) context: PluginContext) {
    super(context);
  }
}

export { WagoCredentialOperationUncertainError } from './wago.wago-credential-operation-uncertain-error';
