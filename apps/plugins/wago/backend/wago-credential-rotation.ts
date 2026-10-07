import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCredentialRotationServiceHandoffOperation } from './wago-credential-rotation.wago-credential-rotation-service-handoff-operation';

@Injectable()
export class WagoCredentialRotationService extends WagoCredentialRotationServiceHandoffOperation {
  constructor(@Inject(PLUGIN_CONTEXT) context: PluginContext) {
    super(context);
  }
}

export { WagoCredentialRotationUncertainError } from './wago-credential-rotation.classes';
