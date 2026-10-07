import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { Inject } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCredentialRotationServiceStatusContract } from './wago-credential-rotation.wago-credential-rotation-service-status-contract';


export abstract class WagoCredentialRotationServiceState extends WagoCredentialRotationServiceStatusContract {
  constructor(@Inject(PLUGIN_CONTEXT) protected readonly context: PluginContext) {
    super();
  }

  protected get repository() {
    return this.context.getRepository(WagoCredentialRotationEntity);
  }
}
